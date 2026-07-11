require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db'); // initializes tables on first run

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true }
}));

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => res.status(404).render('404'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pixel Wave Logistics running at http://localhost:${PORT}`);
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set — emails will be simulated (logged, not delivered).');
  }
});
