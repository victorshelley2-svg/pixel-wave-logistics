const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../lib/email');

const STATUS_OPTIONS = [
  'Registered', 'Picked Up', 'In Transit', 'Out for Delivery',
  'Delivered', 'Delayed', 'Exception'
];

const SITE_URL = 'https://pixelwavelogistics.com';

function genTrackingNumber() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const letters = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `PW-${digits}-${letters}`;
}

function genReferenceNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `PWREF-${s}`;
}

function emailShell(bodyHtml) {
  return `
  <div style="margin:0;padding:20px;background:#F4F7FC;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;">
      <div style="background:#2563EB;padding:28px 24px;">
        <span style="display:inline-block;width:14px;height:14px;background:#fff;margin-right:8px;vertical-align:middle;opacity:.9;"></span>
        <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px;vertical-align:middle;">PIXEL WAVE <span style="opacity:.7;font-weight:600;">LOGISTICS</span></span>
      </div>
      <div style="padding:28px 24px;">
        ${bodyHtml}
      </div>
      <div style="background:#F4F7FC;padding:20px 24px;text-align:center;">
        <p style="font-size:12px;color:#98A2B3;margin:0;">Pixel Wave Logistics &mdash; signal never sleeps</p>
      </div>
    </div>
  </div>`;
}

function registrationEmailHtml(shipment) {
  return emailShell(`
    <p style="font-size:15px;color:#101828;margin:0 0 16px;">Hello ${shipment.receiver_name},</p>
    <p style="font-size:15px;color:#101828;line-height:1.5;margin:0 0 16px;">We're writing to confirm that a package has been successfully registered with your details.</p>
    <p style="font-size:15px;color:#101828;line-height:1.5;margin:0 0 20px;">Below are the details of the registered package:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding:8px 0;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tracking Number</td>
        <td style="padding:8px 0;color:#101828;font-size:14px;font-weight:bold;text-align:right;">${shipment.tracking_number}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Reference Number</td>
        <td style="padding:8px 0;color:#101828;font-size:14px;text-align:right;">${shipment.reference_number}</td>
      </tr>
    </table>
    <p style="font-size:14px;color:#475467;line-height:1.5;margin:0 0 24px;">Please review the details above to ensure they are correct. If you have any questions or need changes, please contact us immediately.</p>
    <a href="${SITE_URL}/track?tn=${shipment.tracking_number}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:bold;">Track Shipment</a>
  `);
}

function statusUpdateEmailHtml(shipment, status, location, note) {
  return emailShell(`
    <p style="font-size:15px;color:#101828;margin:0 0 16px;">Hi ${shipment.receiver_name},</p>
    <p style="font-size:15px;color:#101828;line-height:1.5;margin:0 0 20px;">Your shipment <strong>${shipment.tracking_number}</strong> from ${shipment.origin} to ${shipment.destination} has a new status:</p>
    <div style="display:inline-block;background:#EFF6FF;color:#2563EB;font-weight:bold;font-size:13px;letter-spacing:.5px;text-transform:uppercase;padding:8px 16px;border-radius:20px;margin-bottom:20px;">${status}</div>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:8px 0;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Location</td>
        <td style="padding:8px 0;color:#101828;font-size:14px;text-align:right;">${location}</td>
      </tr>
      ${note ? `<tr><td style="padding:8px 0;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Note</td><td style="padding:8px 0;color:#101828;font-size:14px;text-align:right;">${note}</td></tr>` : ''}
    </table>
    <a href="${SITE_URL}/track?tn=${shipment.tracking_number}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:14px;font-weight:bold;margin-top:12px;">Track Shipment</a>
  `);
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
  const { total, inTransit, delivered, flagged } = db.getStats();
  const unread = db.getUnreadCount();
  const recent = db.getAllShipments().slice(0, 5);
  res.render('admin/dashboard', { total, inTransit, delivered, flagged, unread, recent });
});

// ---- register ----
router.get('/register', (req, res) => res.render('admin/register', { created: null }));

router.post('/register', async (req, res) => {
  const tn = genTrackingNumber();
  const ref = genReferenceNumber();
  const shipment = db.createShipment({ ...req.body, tracking_number: tn, reference_number: ref });

  if (shipment.receiver_email) {
    const subject = `Package Registered — ${tn}`;
    const text = `Hello ${shipment.receiver_name},

We're writing to confirm that a package has been successfully registered with your details.

Tracking number: ${tn}
Reference number: ${ref}

Please review the details above to ensure they are correct. If you have any questions or need changes, please contact us immediately.

Track it anytime: ${SITE_URL}/track?tn=${tn}

— Pixel Wave Logistics`;

    const result = await sendEmail({
      to: shipment.receiver_email,
      from: process.env.FROM_EMAIL || 'notifications@pixelwavelogistics.com',
      subject,
      text,
      html: registrationEmailHtml(shipment)
    });

    db.createMessage({
      direction: 'sent',
      from_email: process.env.FROM_EMAIL || 'notifications@pixelwavelogistics.com',
      to_email: shipment.receiver_email,
      subject,
      body: text,
      related_tracking: tn
    });
  }

  res.render('admin/register', { created: tn });
});

// ---- shipment list / detail / update ----
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

Track it anytime: ${SITE_URL}/track?tn=${shipment.tracking_number}

— Pixel Wave Logistics`;

    const result = await sendEmail({
      to: shipment.receiver_email,
      from: process.env.FROM_EMAIL || 'notifications@pixelwavelogistics.com',
      subject,
      text,
      html: statusUpdateEmailHtml(shipment, status, location || shipment.destination, note)
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
function composeEmailHtml(message) {
  return emailShell(`
    <p style="font-size:15px;color:#101828;line-height:1.6;white-space:pre-wrap;margin:0;">${message}</p>
  `);
}
// ---- webmail ----
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
router.get('/webmail/compose', (req, res) => res.render('admin/webmail-compose', { sent: null }));

router.post('/webmail/compose', async (req, res) => {
  const { to, subject, message } = req.body;
  const from = process.env.SUPPORT_EMAIL || 'support@pixelwavelogistics.com';

  const result = await sendEmail({ to, from, subject, text: message, html: composeEmailHtml(message) });

  db.createMessage({ direction: 'sent', from_email: from, to_email: to, subject, body: message });

  res.render('admin/webmail-compose', { sent: result.simulated ? 'simulated' : (result.ok ? 'sent' : 'failed') });
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
