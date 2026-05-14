// ============================================================
// DISTRIBUIDORA DE AVILA — Tienda principal
// ============================================================

const WA_NUMBER = '5492396618956';

const CAT_ICONS = {
  papeleria: '📝', cotillon: '🎉', bazar: '🏠',
  libreria: '📚', reposteria: '🎂', default: '📦'
};
const CAT_LABELS = {
  papeleria: 'Papelería', cotillon: 'Cotillón',
  bazar: 'Bazar', libreria: 'Librería', reposteria: 'Repostería'
};

let allProducts = [];
let cart = {};
let currentCat = 'todas';
let searchQuery = '';

// ---- INICIALIZACIÓN ----
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  bindUI();
});

async function loadProducts() {
  try {
    if (window.FIREBASE_CONFIGURED && window.db) {
      const doc = await window.db.collection('catalog').doc('products').get();
      allProducts = doc.exists ? (doc.data().items || []) : [];
    } else {
      const raw = localStorage.getItem('davila_products');
      allProducts = raw ? JSON.parse(raw) : [];
    }
  } catch (err) {
    console.error('Error cargando productos:', err);
    const raw = localStorage.getItem('davila_products');
    allProducts = raw ? JSON.parse(raw) : [];
  }
  renderProducts();
}

// ---- RENDER ----
function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.getElementById('productsCount');

  if (!allProducts.length) {
    grid.innerHTML = '';
    emptyState.classList.add('visible');
    countEl.textContent = '';
    return;
  }
  emptyState.classList.remove('visible');

  let filtered = allProducts;
  if (currentCat !== 'todas') {
    filtered = filtered.filter(p => normalize(p.categoria) === currentCat);
  }
  if (searchQuery) {
    const q = normalize(searchQuery);
    filtered = filtered.filter(p =>
      normalize(p.nombre).includes(q) ||
      normalize(p.codigo || '').includes(q) ||
      normalize(p.categoria || '').includes(q)
    );
  }

  countEl.textContent = filtered.length
    ? `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`
    : 'Sin resultados';

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:#777;">
      Sin resultados para esa búsqueda.
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(productCard).join('');
  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.id));
  });
}

function productCard(p) {
  const catKey = normalize(p.categoria);
  const icon = CAT_ICONS[catKey] || CAT_ICONS.default;
  const catLabel = CAT_LABELS[catKey] || p.categoria;
  const imgHtml = p.imagen
    ? `<img src="${escapeHtml(p.imagen)}" alt="${escapeHtml(p.nombre)}" loading="lazy"
        onerror="this.parentElement.innerHTML='<span class=\\'product-placeholder\\'>${icon}</span>'" />`
    : `<span class="product-placeholder">${icon}</span>`;

  return `
    <div class="product-card">
      <div class="product-img-wrap">
        ${imgHtml}
        <span class="product-cat-tag">${escapeHtml(catLabel)}</span>
      </div>
      <div class="product-info">
        ${p.codigo ? `<span class="product-code">Cód. ${escapeHtml(p.codigo)}</span>` : ''}
        <h3 class="product-name">${escapeHtml(p.nombre)}</h3>
        <p class="product-price">${formatPrice(p.precio)}</p>
      </div>
      <div class="product-actions">
        <button class="add-to-cart" data-id="${escapeHtml(p.id)}">🛒 Agregar</button>
      </div>
    </div>`;
}

// ---- CARRITO ----
function addToCart(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  cart[id] ? cart[id].qty++ : (cart[id] = { ...product, qty: 1 });
  updateCartUI();
  showToast(`✓ ${product.nombre} agregado`);
}

function removeFromCart(id) {
  delete cart[id];
  updateCartUI();
}

function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id].qty += delta;
  if (cart[id].qty <= 0) delete cart[id];
  updateCartUI();
}

function updateCartUI() {
  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + (parseFloat(i.precio) || 0) * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cartCount').textContent = count;

  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');

  if (!items.length) {
    body.innerHTML = '<p class="cart-empty-msg">Tu carrito está vacío</p>';
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';
  document.getElementById('cartTotal').textContent = formatPrice(total);

  body.innerHTML = items.map(item => {
    const icon = CAT_ICONS[normalize(item.categoria)] || CAT_ICONS.default;
    return `
      <div class="cart-item">
        <span class="cart-item-icon">${icon}</span>
        <div class="cart-item-info">
          <p class="cart-item-name">${escapeHtml(item.nombre)}</p>
          <p class="cart-item-price">${formatPrice(item.precio)} c/u</p>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.id}')" title="Eliminar">🗑</button>
      </div>`;
  }).join('');
}

// ---- WHATSAPP ----
document.getElementById('sendWhatsApp').addEventListener('click', () => {
  const items = Object.values(cart);
  if (!items.length) return;

  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const note = document.getElementById('customerNote').value.trim();
  const payment = document.querySelector('input[name="payment"]:checked');

  if (!name) {
    document.getElementById('customerName').focus();
    showToast('Por favor ingresá tu nombre');
    return;
  }
  if (!payment) {
    showToast('Seleccioná un medio de pago');
    return;
  }

  const total = items.reduce((s, i) => s + (parseFloat(i.precio) || 0) * i.qty, 0);

  let msg = `¡Hola! Quisiera hacer el siguiente pedido 🛒\n\n`;
  msg += `*Cliente:* ${name}\n`;
  if (phone) msg += `*Teléfono:* ${phone}\n`;
  msg += `*Medio de pago:* ${payment.value}\n`;
  msg += `\n*Productos:*\n`;

  items.forEach(item => {
    const sub = (parseFloat(item.precio) || 0) * item.qty;
    msg += `• ${item.qty}x ${item.nombre}`;
    if (item.precio) msg += ` — ${formatPrice(sub)}`;
    msg += `\n`;
  });

  msg += `\n*Total estimado: ${formatPrice(total)}*`;
  if (note) msg += `\n\n*Aclaración:* ${note}`;
  msg += `\n\n_Aguardo confirmación. ¡Muchas gracias!_`;

  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
});

// ---- FILTROS ----
function bindUI() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCat = btn.dataset.cat;
      renderProducts();
    });
  });

  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = e.target.value; renderProducts(); }, 250);
  });

  document.getElementById('cartToggle').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
}

function openCart() {
  document.getElementById('cartSidebar').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ---- UTILS ----
function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
}
function formatPrice(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return 'Consultar';
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
