const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => res.render('home'));

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

module.exports = router;
