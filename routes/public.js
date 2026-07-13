const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => res.render('home'));
router.get('/about', (req, res) => res.render('about'));
router.get('/careers', (req, res) => res.render('careers'));
router.get('/sustainability', (req, res) => res.render('sustainability'));
router.get('/track', (req, res) => {
  const tn = (req.query.tn || '').trim().toUpperCase();
  let shipment = null;
  let events = [];

  if (tn) {
    shipment = db.getShipmentByTN(tn);
    if (shipment) {
      events = [...shipment.events].reverse();
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

  db.createMessage({
    direction: 'inbox',
    from_email: email,
    to_email: process.env.SUPPORT_EMAIL || 'support@pixelwavelogistics.com',
    subject: subject || `Message from ${name}`,
    body: `From: ${name} <${email}>\n\n${message}`
  });

  res.render('contact', { sent: true });
});
router.post('/webhooks/resend-inbound', express.json(), (req, res) => {
  if (req.query.key !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = req.body || {};
  const data = payload.data || {};

  const fromEmail = typeof data.from === 'string' ? data.from : (data.from && data.from.email) || 'unknown';
  const toEmail = Array.isArray(data.to) ? (data.to[0].email || data.to[0]) : (data.to || '');

  db.createMessage({
    direction: 'inbox',
    from_email: fromEmail,
    to_email: toEmail,
    subject: data.subject || '(no subject)',
    body: data.text || data.html || '(no content)'
  });

  res.status(200).json({ received: true });
});
module.exports = router;
