require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Datenbank Setup ──
const db = new Database('./shop.db');
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  address TEXT,
  items TEXT,
  total REAL,
  payment_method TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Admin Password (aus .env)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Simple Token Store
const tokens = new Map();

// Token generieren
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Authentifizierungs-Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ message: 'Authentifizierung erforderlich' });
  }

  const token = authHeader.split(' ')[1];
  
  if (!tokens.has(token)) {
    return res.status(401).json({ message: 'Ungültiger Token' });
  }

  next();
}

// ADMIN LOGIN ROUTE - MUSS VOR ALLEN ANDEREN ROUTES KOMMEN!
app.post('/api/admin/login', (req, res) => {
  console.log('Login versucht mit Passwort:', req.body.password);
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Passwort erforderlich' });
  }

  console.log('ADMIN_PASSWORD aus ENV:', ADMIN_PASSWORD);
  console.log('Eingabe Passwort:', password);
  console.log('Vergleich:', password === ADMIN_PASSWORD);

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Falsches Passwort' });
  }

  // Token erstellen und speichern
  const token = generateToken();
  tokens.set(token, { createdAt: Date.now() });

  // Tokens nach 24h löschen
  setTimeout(() => tokens.delete(token), 24 * 60 * 60 * 1000);

  res.json({ token });
});

// ── Produkte ──
const PRODUCTS = [
  {id:1, name:'Kopfhörer Pro', price:129, stock:10},
  {id:2, name:'Smartwatch X2', price:249, stock:5},
  {id:3, name:'USB-C Hub 7-Port', price:39, stock:20},
  {id:4, name:'Bluetooth Lautsprecher', price:79, stock:15},
  {id:5, name:'Laptop Ständer', price:49, stock:12},
  {id:6, name:'Winterjacke', price:89, stock:8},
  {id:7, name:'Laufschuhe', price:119, stock:6},
  {id:8, name:'Yoga-Matte', price:29, stock:25},
  {id:9, name:'Küchenmaschine', price:199, stock:4},
  {id:10, name:'Kaffeemaschine', price:159, stock:7},
  {id:11, name:'Roman: Nordlicht', price:14, stock:30},
  {id:12, name:'Fahrradhelm', price:69, stock:9},
];

// ── Routen ──
app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

// Geschützte Route - Admin only
app.get('/api/orders', authenticateAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ── Bestellung speichern ──
app.post('/api/orders', (req, res) => {
  try {
    const {name, email, address, items, total, payment_method} = req.body;
    const result = db.prepare(
      'INSERT INTO orders (name, email, address, items, total, payment_method) VALUES (?,?,?,?,?,?)'
    ).run(name, email, address, JSON.stringify(items), total, payment_method);
    
    sendConfirmationEmail(email, name, items, total);
    res.json({success: true, orderId: result.lastInsertRowid});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ── Stripe Zahlung ──
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({error: 'Stripe ist nicht konfiguriert. Bitte STRIPE_SECRET_KEY setzen.'});
  }
  try {
    const {amount} = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
    });
    res.json({clientSecret: paymentIntent.client_secret});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ── PayPal Zahlung ──
app.post('/api/paypal/create-order', async (req, res) => {
  const {amount} = req.body;
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=client_credentials'
  });
  const {access_token} = await tokenRes.json();
  const orderRes = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{amount: {currency_code: 'EUR', value: amount.toFixed(2)}}]
    })
  });
  const order = await orderRes.json();
  res.json({orderId: order.id});
});

// ── E-Mail Bestätigung ──
function sendConfirmationEmail(email, name, items, total) {
  if (!process.env.EMAIL_USER) return;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS}
  });
  const itemList = items.map(i => `- ${i.name} x${i.qty} = ${(i.price * i.qty).toFixed(2)} €`).join('\n');
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Deine Bestellung bei MeinShop ✓',
    text: `Hallo ${name},\n\nvielen Dank für deine Bestellung!\n\n${itemList}\n\nGesamt: ${total.toFixed(2)} €\n\nDein MeinShop Team`
  });
}

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
