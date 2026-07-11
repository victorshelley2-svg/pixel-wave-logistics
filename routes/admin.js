const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../lib/email');

const STATUS_OPTIONS = [
  'Registered', 'Picked Up', 'In Transit', 'Out for Delivery',
  'Delivered', 'Delayed', 'Exception'
];

function genTrackingNumber() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const letters = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `PW-${digits}-${letters}`;
}

// ---- auth ----
router.get('/login', (req, res) => res.render('admin/login', { error: null }));

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Incorrect email or password.' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.use(requireAdmin);

// ---- dashboard ----
router.get('/', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM shipments').get().c;
  const inTransit = db.prepare(`SELECT COUNT(*) c FROM shipments WHERE status IN ('In Transit','Out for Delivery')`).get().c;
  const delivered = db.prepare(`SELECT COUNT(*) c FROM shipments WHERE status = 'Delivered'`).get().c;
  const flagged = db.prepare(`SELECT COUNT(*) c FROM shipments WHERE status IN ('Delayed','Exception')`).get().c;
  const unread = db.prepare(`SELECT COUNT(*) c FROM messages WHERE direction='inbox' AND is_read=0`).get().c;
  const recent = db.prepare('SELECT * FROM shipments ORDER BY created_at DESC LIMIT 5').all();
  res.render('admin/dashboard', { total, inTransit, delivered, flagged, unread, recent });
});

// ---- register ----
router.get('/register', (req, res) => res.render('admin/register', { created: null }));

router.post('/register', (req, res) => {
  const {
    sender_name, sender_email, receiver_name, receiver_email,
    origin, destination, weight, service, eta, notes
  } = req.body;

  const tn = genTrackingNumber();
  const now = new Date().toISOString();

  const info = db.prepare(`
    INSERT INTO shipments
      (tracking_number, sender_name, sender_email, receiver_name, receiver_email,
       origin, destination, weight, service, eta, status, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'Registered', ?, ?)
  `).run(tn, sender_name, sender_email, receiver_name, receiver_email,
         origin, destination, weight || null, service, eta || null, notes || '', now);

  db.prepare(`
    INSERT INTO shipment_events (shipment_id, status, location, note, created_at)
    VALUES (?, 'Registered', ?, ?, ?)
  `).run(info.lastInsertRowid, origin, notes || '', now);

  res.render('admin/register', { created: tn });
});

// ---- shipment list / detail / update ----
router.get('/shipments', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`
      SELECT * FROM shipments
      WHERE tracking_number LIKE ? OR sender_name LIKE ? OR receiver_name LIKE ?
      ORDER BY created_at DESC
    `).all(like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM shipments ORDER BY created_at DESC').all();
  }
  res.render('admin/shipments', { rows, q });
});

router.get('/shipments/:tn', (req, res) => {
  const shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(req.params.tn.toUpperCase());
  if (!shipment) return res.redirect('/admin/shipments');
  const events = db.prepare('SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY created_at DESC').all(shipment.id);
  res.render('admin/shipment-detail', { shipment, events, STATUS_OPTIONS, emailStatus: null });
});

router.post('/shipments/:tn/update', async (req, res) => {
  const shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(req.params.tn.toUpperCase());
  if (!shipment) return res.redirect('/admin/shipments');

  const { status, location, note } = req.body;
  const now = new Date().toISOString();

  db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, shipment.id);
  db.prepare(`
    INSERT INTO shipment_events (shipment_id, status, location, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(shipment.id, status, location || shipment.destination, note || '', now);

  let emailStatus = null;
  if (shipment.receiver_email) {
    const subject = `Your shipment ${shipment.tracking_number} is now ${status}`;
    const text = `Hi ${shipment.receiver_name},

Your shipment from ${shipment.origin} to ${shipment.destination} has a new status: ${status}.
Location: ${location || shipment.destination}
${note ? 'Note: ' + note : ''}

Track it anytime: /track?tn=${shipment.tracking_number}

— Pixel Wave Logistics`;

    const result = await sendEmail({
      to: shipment.receiver_email,
      from: process.env.FROM_EMAIL || 'notifications@pixelwavelogistics.com',
      subject,
      text
    });

    db.prepare(`
      INSERT INTO messages (direction, from_email, to_email, subject, body, related_tracking, created_at)
      VALUES ('sent', ?, ?, ?, ?, ?, ?)
    `).run(process.env.FROM_EMAIL || 'notifications@pixelwavelogistics.com',
           shipment.receiver_email, subject, text, shipment.tracking_number, now);

    emailStatus = result.simulated ? 'simulated' : (result.ok ? 'sent' : 'failed');
  }

  const events = db.prepare('SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY created_at DESC').all(shipment.id);
  const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipment.id);
  res.render('admin/shipment-detail', { shipment: updated, events, STATUS_OPTIONS, emailStatus });
});

router.post('/shipments/:tn/delete', (req, res) => {
  const shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(req.params.tn.toUpperCase());
  if (shipment) {
    db.prepare('DELETE FROM shipment_events WHERE shipment_id = ?').run(shipment.id);
    db.prepare('DELETE FROM shipments WHERE id = ?').run(shipment.id);
  }
  res.redirect('/admin/shipments');
});

// ---- webmail ----
router.get('/webmail', (req, res) => {
  const folder = req.query.folder === 'sent' ? 'sent' : 'inbox';
  const rows = db.prepare('SELECT * FROM messages WHERE direction = ? ORDER BY created_at DESC').all(folder);
  res.render('admin/webmail', { rows, folder });
});

router.get('/webmail/:id', (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.redirect('/admin/webmail');
  if (msg.direction === 'inbox' && !msg.is_read) {
    db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(msg.id);
  }
  res.render('admin/webmail-message', { msg, sent: null });
});

router.post('/webmail/:id/reply', async (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.redirect('/admin/webmail');

  const { body } = req.body;
  const subject = msg.subject && msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`;
  const from = process.env.SUPPORT_EMAIL || 'support@pixelwavelogistics.com';

  const result = await sendEmail({ to: msg.from_email, from, subject, text: body });
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (direction, from_email, to_email, subject, body, created_at)
    VALUES ('sent', ?, ?, ?, ?, ?)
  `).run(from, msg.from_email, subject, body, now);

  res.render('admin/webmail-message', { msg, sent: result.simulated ? 'simulated' : (result.ok ? 'sent' : 'failed') });
});

module.exports = router;
