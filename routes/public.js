const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => res.render('home'));

router.get('/track', (req, res) => {
  const tn = (req.query.tn || '').trim().toUpperCase();
  let shipment = null;
  let events = [];

  if (tn) {
    shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(tn);
    if (shipment) {
      events = db.prepare(
        'SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY created_at DESC'
      ).all(shipment.id);
    }
  }

  res.render('track', { tn, shipment, events, notFound: Boolean(tn && !shipment) });
});

router.get('/contact', (req, res) => res.render('contact', { sent: false }));

router.post('/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.render('contact', { sent: false, error: 'Please fill in your name, email, and message.' });
  }

  db.prepare(`
    INSERT INTO messages (direction, from_email, to_email, subject, body, created_at)
    VALUES ('inbox', ?, ?, ?, ?, ?)
  `).run(
    email,
    process.env.SUPPORT_EMAIL || 'support@pixelwavelogistics.com',
    subject || `Message from ${name}`,
    `From: ${name} <${email}>\n\n${message}`,
    new Date().toISOString()
  );

  res.render('contact', { sent: true });
});

module.exports = router;
