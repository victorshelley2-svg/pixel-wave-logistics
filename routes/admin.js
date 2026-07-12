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

router.get('/', (req, res) => {
  const { total, inTransit, delivered, flagged } = db.getStats();
  const unread = db.getUnreadCount();
  const recent = db.getAllShipments().slice(0, 5);
  res.render('admin/dashboard', { total, inTransit, delivered, flagged, unread, recent });
});

router.get('/register', (req, res) => res.render('admin/register', { created: null }));

router.post('/register', (req, res) => {
  const tn = genTrackingNumber();
  const timestamp = req.body.event_time ? new Date(req.body.event_time).toISOString() : new Date().toISOString();
  db.createShipment({ ...req.body, tracking_number: tn, timestamp });
  res.render('admin/register', { created: tn });
});

router.get('/shipments', (req, res) => {
  const q = (req.query.q || '').trim();
  const rows = q ? db.searchShipments(q) : db.getAllShipments();
  res.render('admin/shipments', { rows, q });
});

router.get('/shipments/:tn', (req, res) => {
  const shipment = db.getShipmentByTN(req.params.tn.toUpperCase());
  if (!shipment) return res.redirect('/admin/shipments');
  const events = [...shipment.events].reverse();
  res.render('admin/shipment-detail', { shipment, events, STATUS_OPTIONS, emailStatus: null });
});

router.post('/shipments/:tn/update', async (req, res) => {
  const tn = req.params.tn.toUpperCase();
  const existing = db.getShipmentByTN(tn);
  if (!existing) return res.redirect('/admin/shipments');

  const { status, location, note, event_time } = req.body;
  const timestamp = event_time ? new Date(event_time).toISOString() : new Date().toISOString();
  const shipment = db.addShipmentEvent(tn, { status, location, note, timestamp });
if (!shipment) return res.redirect('/admin/shipments');
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

    db.createMessage({
      direction: 'sent',
      from_email: process.env.FROM_EMAIL || 'notifications@pixelwavelogistics.com',
      to_email: shipment.receiver_email,
      subject,
      body: text,
      related_tracking: shipment.tracking_number
    });

    emailStatus = result.simulated ? 'simulated' : (result.ok ? 'sent' : 'failed');
  }

  const events = [...shipment.events].reverse();
  res.render('admin/shipment-detail', { shipment, events, STATUS_OPTIONS, emailStatus });
});

router.post('/shipments/:tn/delete', (req, res) => {
  db.deleteShipment(req.params.tn.toUpperCase());
  res.redirect('/admin/shipments');
});

router.get('/webmail', (req, res) => {
  const folder = req.query.folder === 'sent' ? 'sent' : 'inbox';
  const rows = db.getMessages(folder);
  res.render('admin/webmail', { rows, folder });
});

router.get('/webmail/:id', (req, res) => {
  const msg = db.getMessageById(req.params.id);
  if (!msg) return res.redirect('/admin/webmail');
  if (msg.direction === 'inbox' && !msg.is_read) {
    db.markMessageRead(msg.id);
  }
  res.render('admin/webmail-message', { msg, sent: null });
});

router.post('/webmail/:id/reply', async (req, res) => {
  const msg = db.getMessageById(req.params.id);
  if (!msg) return res.redirect('/admin/webmail');

  const { body } = req.body;
  const subject = msg.subject && msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`;
  const from = process.env.SUPPORT_EMAIL || 'support@pixelwavelogistics.com';

  const result = await sendEmail({ to: msg.from_email, from, subject, text: body });

  db.createMessage({ direction: 'sent', from_email: from, to_email: msg.from_email, subject, body });

  res.render('admin/webmail-message', { msg, sent: result.simulated ? 'simulated' : (result.ok ? 'sent' : 'failed') });
});

module.exports = router;
