# 🛒 MeinShop - E-Commerce Website

Eine vollständige E-Commerce-Lösung mit Express Backend und Vanilla JavaScript Frontend.

## Features

- ✅ **Produktkatalog** mit Filtern (Preis, Kategorie, Suche)
- ✅ **Einkaufswagen** mit LocalStorage Persistierung
- ✅ **Checkout System** mit Zahlungsoptionen:
  - Stripe (Kreditkarten)
  - PayPal
  - Banküberweisung
- ✅ **Admin Dashboard** für Bestellungsverwaltung
- ✅ **Automatische E-Mail Bestätigungen**
- ✅ **Bestellungsdatenbank** (SQLite)
- ✅ **Responsive Design** für Mobile/Tablet/Desktop

## Installation

### 1. Abhängigkeiten installieren
```bash
cd /Users/saidtarikaltunordu/meinshop-backend
npm install
```

### 2. Umgebungsvariablen konfigurieren

Bearbeite die `.env` Datei:
```env
PORT=3000

# Pflicht: Admin Login Passwort
ADMIN_PASSWORD=bitte_ein_sicheres_passwort

# Erlaubte Browser-Origin(s), komma-separiert
CORS_ORIGIN=http://localhost:3000

# Stripe API Keys (von https://stripe.com/docs)
STRIPE_SECRET_KEY=sk_test_dein_key_hier
STRIPE_PUBLISHABLE_KEY=pk_test_dein_key_hier

# PayPal Credentials (von https://developer.paypal.com)
PAYPAL_CLIENT_ID=dein_client_id
PAYPAL_CLIENT_SECRET=dein_client_secret

# Gmail für E-Mail Versand (App Password erforderlich)
EMAIL_USER=deine@gmail.com
EMAIL_PASS=dein_app_password
```

### 3. Server starten
```bash
node server.js
```

Der Server läuft dann auf: **http://localhost:3000**

## Verwendung

### 👤 Kundenseite
- Öffne http://localhost:3000 im Browser
- Durchsuche Produkte mit Filtern
- Lege Artikel in den Warenkorb
- Checkout mit gewählter Zahlungsmethode

### 📊 Admin Dashboard
- Öffne http://localhost:3000/admin.html
- Sehe alle Bestellungen
- Ändere Bestellungsstatus (Ausstehend → In Bearbeitung → Abgeschlossen)
- Export als CSV
- Live-Statistiken

## API Endpoints

### Produkte
- `GET /api/products` - Alle Produkte abrufen

### Bestellungen
- `GET /api/orders` - Alle Bestellungen abrufen
- `POST /api/orders` - Neue Bestellung erstellen

### Zahlung
- `POST /api/stripe/create-payment-intent` - Stripe Payment Intent
- `POST /api/paypal/create-order` - PayPal Order erstellen

## Datenbankstruktur

Die Datenbank wird automatisch erstellt mit folgender Tabelle:

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  address TEXT,
  items TEXT (JSON),
  total REAL,
  payment_method TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Verfügbare Produkte

1. Kopfhörer Pro - 129€
2. Smartwatch X2 - 249€
3. USB-C Hub 7-Port - 39€
4. Bluetooth Lautsprecher - 79€
5. Laptop Ständer - 49€
6. Winterjacke - 89€
7. Laufschuhe - 119€
8. Yoga-Matte - 29€
9. Küchenmaschine - 199€
10. Kaffeemaschine - 159€
11. Roman: Nordlicht - 14€
12. Fahrradhelm - 69€

## Projektstruktur

```
meinshop-backend/
├── server.js              # Express Server
├── package.json          # Dependencies
├── .env                  # Umgebungsvariablen
├── shop.db               # SQLite Datenbank (wird erstellt)
└── public/               # Frontend Files
    ├── index.html        # Shop-Seite
    ├── admin.html        # Admin Dashboard
    ├── style.css         # Styling
    ├── app.js            # Shop-Logik
    └── admin.js          # Admin-Logik
```

## Zahlungsintegration Setup

### Stripe
1. Gehe zu https://stripe.com
2. Registriere dich und melde dich an
3. Kopiere deinen Secret Key von https://dashboard.stripe.com/apikeys
4. Füge ihn in `.env` ein

### PayPal
1. Gehe zu https://developer.paypal.com
2. Erstelle eine Business App
3. Kopiere Client ID und Secret
4. Füge sie in `.env` ein

### Gmail (für E-Mail Versand)
1. Erstelle ein Google Account
2. Aktiviere "2-Step Verification": https://myaccount.google.com/security
3. Erstelle ein "App Password": https://myaccount.google.com/apppasswords
4. Verwende das Passwort als `EMAIL_PASS` in `.env`

## Troubleshooting

**Port 3000 ist bereits belegt:**
```bash
# Ändern in .env
PORT=3001
```

**Fehler beim Senden von E-Mails:**
- Gmail-App-Passwort in `.env` überprüfen
- "Weniger sichere Apps zulassen" deaktivieren (falls verwendet)

**Stripe zahlt nicht funktioniert:**
- Test-Keys verwenden (mit `sk_test_` beginnen)
- Console in Browser überprüfen auf Fehler

## Lizenz

Dieses Projekt ist zu Demonstrationszwecken erstellt.

---

**Fragen?** Der Code ist vollständig kommentiert und sehr anfängerfreundlich! 🚀
