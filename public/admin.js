// Admin Dashboard Logik

let allOrders = [];
let selectedOrderId = null;

// Check Authentication
function checkAuth() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    // Redirect to login
    window.location.href = '/admin-login.html';
    return false;
  }
  return true;
}

// Logout Handler
function handleLogout() {
  if (confirm('Möchten Sie sich wirklich abmelden?')) {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin-login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  
  loadOrders();
  setupStatusFilter();
  // Auto-refresh alle 30 Sekunden
  setInterval(loadOrders, 30000);
});

// Bestellungen laden
async function loadOrders() {
  try {
    const token = localStorage.getItem('adminToken');
    const response = await fetch('/api/orders', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      // Unauthorized - Token ist ungültig
      localStorage.removeItem('adminToken');
      window.location.href = '/admin-login.html';
      return;
    }

    allOrders = await response.json();
    displayOrders(allOrders);
    updateStats();
  } catch (error) {
    console.error('Fehler beim Laden der Bestellungen:', error);
    document.getElementById('ordersTable').innerHTML = 
      '<tr><td colspan="10" class="empty-state">Fehler beim Laden der Bestellungen</td></tr>';
  }
}

// Bestellungen anzeigen
function displayOrders(ordersToShow) {
  const tbody = document.getElementById('ordersTable');
  tbody.innerHTML = '';

  if (ordersToShow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Keine Bestellungen gefunden.</td></tr>';
    return;
  }

  ordersToShow.forEach(order => {
    let items = 'N/A';
    try {
      items = JSON.parse(order.items).map(i => `${i.name} x${i.qty}`).join(', ');
      if (items.length > 40) items = items.substring(0, 40) + '...';
    } catch (e) {
      items = order.items;
    }

    const statusClass = `status-${order.status}`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>#${order.id}</td>
      <td>${order.name}</td>
      <td>${order.email}</td>
      <td>${order.address}</td>
      <td title="Vollständige Liste anzeigen" style="cursor: help;">${items}</td>
      <td><strong>${order.total.toFixed(2)} €</strong></td>
      <td>${capitalizeFirst(order.payment_method)}</td>
      <td><span class="status-badge ${statusClass}">${capitalizeFirst(order.status)}</span></td>
      <td>${formatDate(order.created_at)}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-edit" onclick="openStatusModal(${order.id})">Edit</button>
          <button class="btn-delete" onclick="deleteOrder(${order.id})">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Status Filter
function setupStatusFilter() {
  document.getElementById('statusFilter').addEventListener('change', function() {
    const status = this.value;
    const filtered = status === 'all' ? allOrders : allOrders.filter(o => o.status === status);
    displayOrders(filtered);
  });
}

// Statistiken aktualisieren
function updateStats() {
  const totalOrders = allOrders.length;
  const pendingOrders = allOrders.filter(o => o.status === 'pending').length;
  const completedOrders = allOrders.filter(o => o.status === 'completed').length;
  const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0);

  document.getElementById('totalOrders').textContent = totalOrders;
  document.getElementById('pendingOrders').textContent = pendingOrders;
  document.getElementById('completedOrders').textContent = completedOrders;
  document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(2) + ' €';
}

// Status Modal
function openStatusModal(orderId) {
  selectedOrderId = orderId;
  const order = allOrders.find(o => o.id === orderId);
  if (order) {
    document.getElementById('newStatus').value = order.status;
    document.getElementById('statusModal').classList.add('show');
  }
}

function closeStatusModal() {
  document.getElementById('statusModal').classList.remove('show');
  selectedOrderId = null;
}

// Status aktualisieren (auf Backend senden)
async function updateOrderStatus() {
  if (!selectedOrderId) return;

  const newStatus = document.getElementById('newStatus').value;
  const token = localStorage.getItem('adminToken');

  // Demo: Lokal aktualisieren
  const order = allOrders.find(o => o.id === selectedOrderId);
  if (order) {
    order.status = newStatus;
    displayOrders(allOrders);
    updateStats();
    closeStatusModal();
    showNotification(`✓ Status zu "${capitalizeFirst(newStatus)}" geändert!`);
  }
}

// Bestellung löschen
async function deleteOrder(orderId) {
  if (!confirm('Bestellung wirklich löschen?')) return;

  try {
    // Beispiel: DELETE-Anfrage an Backend
    // const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });

    // Demo: Lokal löschen
    allOrders = allOrders.filter(o => o.id !== orderId);
    displayOrders(allOrders);
    updateStats();
    showNotification('✓ Bestellung gelöscht!');
  } catch (error) {
    alert('Fehler beim Löschen: ' + error.message);
  }
}

// As CSV exportieren
function exportOrders() {
  if (allOrders.length === 0) {
    alert('Keine Bestellungen zum Exportieren');
    return;
  }

  let csv = 'ID,Datum,Kunde,E-Mail,Adresse,Produkte,Gesamtbetrag,Payment,Status\n';

  allOrders.forEach(order => {
    let items = 'N/A';
    try {
      items = JSON.parse(order.items).map(i => `${i.name} x${i.qty}`).join('; ');
    } catch (e) {
      items = order.items;
    }

    // CSV-Escaping
    const escape = (str) => `"${String(str).replace(/"/g, '""')}"`;

    csv += `${order.id},${formatDate(order.created_at)},${escape(order.name)},${escape(order.email)},${escape(order.address)},${escape(items)},${order.total.toFixed(2)},${order.payment_method},${order.status}\n`;
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);

  showNotification('✓ CSV exportiert!');
}

// Hilfsfunktionen
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function capitalizeFirst(str) {
  if (!str) return '';
  const map = {
    'pending': 'Ausstehend',
    'processing': 'In Bearbeitung',
    'completed': 'Abgeschlossen',
    'cancelled': 'Storniert',
    'stripe': 'Stripe',
    'paypal': 'PayPal',
    'bank': 'Banküberweisung'
  };
  return map[str] || str.charAt(0).toUpperCase() + str.slice(1);
}

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
    closeStatusModal();
  }
});
