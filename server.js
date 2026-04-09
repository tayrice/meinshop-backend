require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const STRIPE_PUBLISHABLE_KEY = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
const ALLOWED_PAYMENT_METHODS = new Set(['stripe', 'paypal', 'bank']);

class ValidationError extends Error {}

const rawAdminPassword = process.env.ADMIN_PASSWORD;
if (!rawAdminPassword || !rawAdminPassword.trim()) {
  throw new Error('ADMIN_PASSWORD fehlt in der .env und ist zwingend erforderlich.');
}
const ADMIN_PASSWORD = rawAdminPassword.trim();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin nicht erlaubt durch CORS'));
  }
};

app.disable('x-powered-by');
app.use(cors(corsOptions));
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

// Simple Token Store
const tokens = new Map();
const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return false;

  if (now - record.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }

  return record.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttemptAt: now });
    return;
  }
  record.count += 1;
}

function clearFailedAttempts(ip) {
  loginAttempts.delete(ip);
}

function isValidAdminPassword(inputPassword) {
  if (typeof inputPassword !== 'string' || inputPassword.length === 0) return false;

  const provided = Buffer.from(inputPassword);
  const expected = Buffer.from(ADMIN_PASSWORD);

  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

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
  const ip = getClientIp(req);

  if (isRateLimited(ip)) {
    return res.status(429).json({ message: 'Zu viele Login-Versuche. Bitte spaeter erneut versuchen.' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Passwort erforderlich' });
  }

  if (!isValidAdminPassword(password)) {
    recordFailedAttempt(ip);
    return res.status(401).json({ message: 'Falsches Passwort' });
  }

  clearFailedAttempts(ip);

  // Token erstellen und speichern
  const token = generateToken();
  tokens.set(token, { createdAt: Date.now() });

  // Tokens nach 24h löschen
  setTimeout(() => tokens.delete(token), 24 * 60 * 60 * 1000);

  res.json({ token });
});

// ── Produkte ──
const PRODUCTS = [
  {id:1, name:'Glow Starter Serum', price:34, stock:38},
  {id:2, name:'Hydra Balance Serum', price:39, stock:32},
  {id:3, name:'Retinal Night Repair', price:49, stock:21},
  {id:4, name:'Calm Barrier Drops', price:37, stock:27},
  {id:5, name:'Vitamin C Radiance 12%', price:45, stock:24},
  {id:6, name:'Peptide Lift Concentrate', price:59, stock:16},
  {id:7, name:'Hyaluron Cloud Essence', price:41, stock:28},
  {id:8, name:'Niacinamide Pore Refine', price:36, stock:20},
  {id:9, name:'COTYORA Discovery Set', price:89, stock:12},
  {id:10, name:'Golden Recovery Elixir', price:79, stock:10},
];

const PRODUCTS_BY_ID = new Map(PRODUCTS.map((product) => [product.id, product]));

function parseOrderPayload(payload) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const paymentMethod = typeof payload.payment_method === 'string' ? payload.payment_method : '';
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!name || !email || !address) {
    throw new ValidationError('Name, E-Mail und Adresse sind erforderlich.');
  }

  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    throw new ValidationError('Ungültige Zahlungsmethode.');
  }

  if (items.length === 0) {
    throw new ValidationError('Warenkorb ist leer.');
  }

  let computedTotal = 0;
  const normalizedItems = items.map((item) => {
    const id = Number(item.id);
    const qty = Number(item.qty);

    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
      throw new ValidationError('Ungültige Produktdaten im Warenkorb.');
    }

    const product = PRODUCTS_BY_ID.get(id);
    if (!product) {
      throw new ValidationError('Ein Produkt im Warenkorb existiert nicht mehr.');
    }

    if (qty > product.stock) {
      throw new ValidationError(`Nicht genug Bestand fuer ${product.name}.`);
    }

    computedTotal += product.price * qty;
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      qty
    };
  });

  return {
    name,
    email,
    address,
    payment_method: paymentMethod,
    items: normalizedItems,
    total: Number(computedTotal.toFixed(2))
  };
}

// ── Routen ──
app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

app.get('/api/config/public', (req, res) => {
  const stripeEnabled = Boolean(stripe && STRIPE_PUBLISHABLE_KEY);
  res.json({
    stripeEnabled,
    stripePublishableKey: stripeEnabled ? STRIPE_PUBLISHABLE_KEY : null
  });
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
    const parsedOrder = parseOrderPayload(req.body);
    const clientTotal = Number(req.body.total);

    if (Number.isFinite(clientTotal) && Math.abs(clientTotal - parsedOrder.total) > 0.01) {
      return res.status(400).json({error: 'Der Gesamtbetrag stimmt nicht mit dem Warenkorb ueberein.'});
    }

    const result = db.prepare(
      'INSERT INTO orders (name, email, address, items, total, payment_method) VALUES (?,?,?,?,?,?)'
    ).run(
      parsedOrder.name,
      parsedOrder.email,
      parsedOrder.address,
      JSON.stringify(parsedOrder.items),
      parsedOrder.total,
      parsedOrder.payment_method
    );
    
    sendConfirmationEmail(parsedOrder.email, parsedOrder.name, parsedOrder.items, parsedOrder.total);
    res.json({success: true, orderId: result.lastInsertRowid});
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({error: err.message});
    }
    res.status(500).json({error: 'Bestellung konnte nicht gespeichert werden.'});
  }
});

// ── Stripe Zahlung ──
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({error: 'Stripe ist nicht konfiguriert. Bitte STRIPE_SECRET_KEY setzen.'});
  }
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({error: 'Ungueltiger Zahlungsbetrag.'});
    }

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
