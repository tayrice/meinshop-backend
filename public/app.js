// Globale Variablen
let products = [];
let cart = [];
let stripe = null;
let elements = null;
let cardElement = null;

// Kategorien für Produkte
const productCategories = {
  'Glow Starter Serum': 'brightening',
  'Hydra Balance Serum': 'hydration',
  'Retinal Night Repair': 'antiaging',
  'Calm Barrier Drops': 'sensitive',
  'Vitamin C Radiance 12%': 'brightening',
  'Peptide Lift Concentrate': 'antiaging',
  'Hyaluron Cloud Essence': 'hydration',
  'Niacinamide Pore Refine': 'sensitive',
  'COTYORA Discovery Set': 'sets',
  'Golden Recovery Elixir': 'antiaging'
};

const categoryTags = {
  hydration: 'Hydra',
  antiaging: 'Lift',
  brightening: 'Glow',
  sensitive: 'Calm',
  sets: 'Set'
};

// Scroll to Section
function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

// Filter by Category
function filterByCategory(category) {
  document.getElementById('categoryFilter').value = category;
  applyFilters();
  scrollToSection('produkte');
}

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  await setupStripe();
  setupPaymentMethodChange();
  displayProducts(products);
  loadCart();
});

// Produkte laden
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    products = await response.json();
  } catch (error) {
    console.error('Fehler beim Laden der Produkte:', error);
  }
}

// Stripe Setup
async function setupStripe() {
  try {
    const response = await fetch('/api/config/public');
    if (!response.ok) {
      disableStripePayment();
      return;
    }

    const config = await response.json();
    if (!config.stripeEnabled || !config.stripePublishableKey) {
      disableStripePayment();
      return;
    }

    stripe = Stripe(config.stripePublishableKey);
    elements = stripe.elements();
    cardElement = elements.create('card');
    cardElement.mount('#card-element');
    
    cardElement.addEventListener('change', function(event) {
      const displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
    });
  } catch (error) {
    console.error('Stripe-Konfiguration konnte nicht geladen werden:', error);
    disableStripePayment();
  }
}

function disableStripePayment() {
  const stripeInput = document.querySelector('input[name="payment"][value="stripe"]');
  const stripeOption = stripeInput?.closest('.payment-option');
  const stripeContainer = document.getElementById('stripeContainer');
  const paypalInput = document.querySelector('input[name="payment"][value="paypal"]');
  const bankInput = document.querySelector('input[name="payment"][value="bank"]');

  if (stripeOption) {
    stripeOption.style.display = 'none';
  }

  if (stripeContainer) {
    stripeContainer.style.display = 'none';
  }

  if (stripeInput?.checked) {
    if (paypalInput) {
      paypalInput.checked = true;
    } else if (bankInput) {
      bankInput.checked = true;
    }
  }
}

// Payment Method wechsel
function setupPaymentMethodChange() {
  const setPaymentVisibility = (method) => {
    document.getElementById('stripeContainer').style.display = method === 'stripe' ? 'block' : 'none';
    document.getElementById('paypalContainer').style.display = method === 'paypal' ? 'block' : 'none';
  };

  const paymentRadios = document.querySelectorAll('input[name="payment"]');
  paymentRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      setPaymentVisibility(this.value);
    });
  });

  const selectedPayment = document.querySelector('input[name="payment"]:checked');
  setPaymentVisibility(selectedPayment ? selectedPayment.value : 'bank');
}

// Produkte anzeigen
function displayProducts(productsToShow) {
  const productList = document.getElementById('productList');
  productList.innerHTML = '';

  if (productsToShow.length === 0) {
    productList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px;">Keine Produkte gefunden.</p>';
    return;
  }

  productsToShow.forEach(product => {
    const category = productCategories[product.name] || 'hydration';
    const categoryTag = categoryTags[category] || 'Serum';

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-image" data-fly="✦">
        <span class="product-tag">${categoryTag}</span>
      </div>
      <div class="product-info">
        <div class="product-name">${product.name}</div>
        <div class="product-price">${product.price.toFixed(2)} €</div>
        <div class="product-stock">${product.stock > 0 ? `${product.stock} verfügbar` : 'Ausverkauft'}</div>
        <div class="quantity-selector">
          <button type="button" onclick="decreaseQuantity(this)">−</button>
          <input type="number" class="product-qty" value="1" min="1" max="${product.stock}">
          <button type="button" onclick="increaseQuantity(this)">+</button>
        </div>
        <button class="btn-add" onclick="addToCart(${product.id}, this)" ${product.stock === 0 ? 'disabled' : ''}>
          ${product.stock === 0 ? 'Ausverkauft' : 'In den Warenkorb'}
        </button>
      </div>
    `;
    productList.appendChild(card);
  });
}

// Produktmenge erhöhen/verringern
function increaseQuantity(btn) {
  const input = btn.parentElement.querySelector('.product-qty');
  const max = parseInt(input.max);
  if (parseInt(input.value) < max) {
    input.value = parseInt(input.value) + 1;
  }
}

function decreaseQuantity(btn) {
  const input = btn.parentElement.querySelector('.product-qty');
  if (parseInt(input.value) > 1) {
    input.value = parseInt(input.value) - 1;
  }
}

// In Warenkorb hinzufügen
function addToCart(productId, btn) {
  const product = products.find(p => p.id === productId);
  const quantity = parseInt(btn.parentElement.querySelector('.product-qty').value);

  const existingItem = cart.find(item => item.id === productId);
  if (existingItem) {
    existingItem.qty += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: quantity
    });
  }

  saveCart();
  animateProductToCart(btn);
  updateCartUI();
  animateCartButton();
}

function animateProductToCart(sourceButton) {
  const cartButton = document.querySelector('.cart-btn');
  const productCard = sourceButton?.closest('.product-card');
  const productImage = productCard?.querySelector('.product-image');

  if (!cartButton || !productImage) {
    return;
  }

  const sourceRect = productImage.getBoundingClientRect();
  const targetRect = cartButton.getBoundingClientRect();

  const flyingItem = document.createElement('div');
  flyingItem.className = 'fly-to-cart-item';
  flyingItem.textContent = productImage.dataset.fly || '✦';

  flyingItem.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
  flyingItem.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
  flyingItem.style.setProperty('--fly-x', `${targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2)}px`);
  flyingItem.style.setProperty('--fly-y', `${targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2)}px`);

  document.body.appendChild(flyingItem);
  flyingItem.addEventListener('animationend', () => flyingItem.remove(), { once: true });
}

function animateCartButton() {
  const cartButton = document.querySelector('.cart-btn');
  const cartBadge = document.getElementById('cartCount');

  if (!cartButton) {
    return;
  }

  cartButton.classList.remove('cart-animate');
  void cartButton.offsetWidth;
  cartButton.classList.add('cart-animate');

  if (cartBadge) {
    cartBadge.classList.remove('badge-animate');
    void cartBadge.offsetWidth;
    cartBadge.classList.add('badge-animate');
  }
}

// Warenkorb-UI aktualisieren
function updateCartUI() {
  const cartCount = document.getElementById('cartCount');
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  const checkoutTotal = document.getElementById('checkoutTotal');
  const checkoutItems = document.getElementById('checkoutItems');

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCount.textContent = totalItems;

  cartItems.innerHTML = '';
  checkoutItems.innerHTML = '';
  let total = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.qty;
    total += itemTotal;

    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';
    cartItem.innerHTML = `
      <div>
        <div class="cart-item-name">${item.name}</div>
        <div style="font-size: 12px; color: #999;">Menge: ${item.qty}</div>
      </div>
      <div>
        <div class="cart-item-price">${itemTotal.toFixed(2)} €</div>
        <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Entfernen</button>
      </div>
    `;
    cartItems.appendChild(cartItem);

    // Checkout items
    const checkoutItem = document.createElement('div');
    checkoutItem.style.marginBottom = '8px';
    checkoutItem.innerHTML = `${item.name} x${item.qty} = ${itemTotal.toFixed(2)} €`;
    checkoutItems.appendChild(checkoutItem);
  });

  cartTotal.textContent = total.toFixed(2) + ' €';
  checkoutTotal.textContent = total.toFixed(2) + ' €';
}

// Aus Warenkorb entfernen
function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  saveCart();
  updateCartUI();
}

// Warenkorb speichern/laden
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function loadCart() {
  const savedCart = localStorage.getItem('cart');
  if (savedCart) {
    cart = JSON.parse(savedCart);
    updateCartUI();
  }
}

// Warenkorb-Sidebar toggle
function toggleCart() {
  const cartSidebar = document.getElementById('cartSidebar');
  cartSidebar.classList.toggle('open');
}

// Zu Kasse gehen
function goToCheckout() {
  if (cart.length === 0) {
    alert('Warenkorb ist leer!');
    return;
  }
  toggleCart();
  document.getElementById('checkoutModal').classList.add('show');
}

function closeCheckout() {
  document.getElementById('checkoutModal').classList.remove('show');
}

// Filter
document.getElementById('categoryFilter')?.addEventListener('change', applyFilters);
document.getElementById('searchInput')?.addEventListener('input', applyFilters);

function applyFilters() {
  const category = document.getElementById('categoryFilter').value;
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();

  const filtered = products.filter(product => {
    const matchCategory = category === 'all' || productCategories[product.name] === category;
    const matchSearch = product.name.toLowerCase().includes(searchTerm);
    return matchCategory && matchSearch;
  });

  displayProducts(filtered);
}

function resetFilters() {
  document.getElementById('categoryFilter').value = 'all';
  document.getElementById('searchInput').value = '';
  displayProducts(products);
}

// Checkout Form
document.getElementById('checkoutForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const address = document.getElementById('address').value;
  const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const payButton = document.getElementById('payButton');
  payButton.disabled = true;
  payButton.textContent = 'Verarbeite...';

  try {
    if (paymentMethod === 'stripe') {
      await processStripePayment(name, email, address, total);
    } else if (paymentMethod === 'paypal') {
      await processPayPalPayment(name, email, address, total);
    } else {
      await submitOrder(name, email, address, total, paymentMethod);
    }
  } catch (error) {
    alert('Zahlung fehlgeschlagen: ' + error.message);
    payButton.disabled = false;
    payButton.textContent = 'Jetzt zahlen';
  }
});

// Stripe Zahlung
async function processStripePayment(name, email, address, total) {
  if (!stripe || !cardElement) {
    throw new Error('Stripe nicht initialisiert');
  }

  // Payment Intent erstellen
  const response = await fetch('/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: total })
  });

  const { clientSecret } = await response.json();

  // Zahlungsbestätigung
  const result = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: { name, email }
    }
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  await submitOrder(name, email, address, total, 'stripe');
}

// PayPal Zahlung
async function processPayPalPayment(name, email, address, total) {
  const response = await fetch('/api/paypal/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: total })
  });

  const { orderId } = await response.json();

  // In echter Anwendung würde PayPal approvalLink verwenden
  await submitOrder(name, email, address, total, 'paypal');
}

// Bestellung absenden
async function submitOrder(name, email, address, total, paymentMethod) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      address,
      items: cart,
      total,
      payment_method: paymentMethod
    })
  });

  const result = await response.json();

  if (result.success) {
    showNotification('✓ Bestellung erfolgreich! E-Mail wird gesendet...');
    cart = [];
    saveCart();
    updateCartUI();
    closeCheckout();
    document.getElementById('checkoutForm').reset();
    
    setTimeout(() => {
      location.reload();
    }, 2000);
  } else {
    throw new Error(result.error);
  }
}

// Benachrichtigung anzeigen
function showNotification(message) {
  const notif = document.createElement('div');
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 15px 20px;
    border-radius: 4px;
    z-index: 400;
    animation: slideIn 0.3s;
  `;
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => notif.remove(), 3000);
}

// Keyboard close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCheckout();
    document.getElementById('cartSidebar').classList.remove('open');
  }
});
