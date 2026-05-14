// ============================================================
// PANEL ADMIN — Distribuidora de Avila
// ============================================================

const ADMIN_PASS = 'avila2025';
const STORAGE_KEY = 'davila_products';
const CAT_LABELS = {
  papeleria: 'Papelería', cotillon: 'Cotillón',
  bazar: 'Bazar', libreria: 'Librería', reposteria: 'Repostería'
};

let allAdminProducts = [];
let pendingProducts = [];
let editingId = null;

// ---- LOGIN ----
document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

async function tryLogin() {
  if (document.getElementById('passInput').value !== ADMIN_PASS) {
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('passInput').value = '';
    return;
  }
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';

  if (!window.FIREBASE_CONFIGURED) {
    document.getElementById('firebaseBanner').style.display = 'flex';
  }

  await loadAdminProducts();
}

// ---- CARGA PRODUCTOS ----
async function loadAdminProducts() {
  try {
    if (window.FIREBASE_CONFIGURED && window.db) {
      const doc = await window.db.collection('catalog').doc('products').get();
      allAdminProducts = doc.exists ? (doc.data().items || []) : [];
    } else {
      const raw = localStorage.getItem(STORAGE_KEY);
      allAdminProducts = raw ? JSON.parse(raw) : [];
    }
  } catch (err) {
    console.error('Error cargando productos:', err);
    allAdminProducts = [];
  }
  renderStats();
  renderManageList();
  if (allAdminProducts.length) {
    document.getElementById('manageSection').style.display = 'block';
  }
}

// ---- GUARDAR EN BASE DE DATOS ----
async function saveToDatabase(products) {
  if (window.FIREBASE_CONFIGURED && window.db) {
    await window.db.collection('catalog').doc('products').set({ items: products });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }
}

// ---- DROP ZONE ----
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]); });

function processFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      parseRows(rows);
    } catch {
      showToast('Error al leer el archivo. Verificá que sea un Excel válido.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseRows(rows) {
  if (!rows.length) { showToast('El archivo está vacío'); return; }

  const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
  const isHeader = firstRow.some(c =>
    ['codigo','código','nombre','producto','categoria','categoría','precio','stock'].includes(c)
  );

  pendingProducts = (isHeader ? rows.slice(1) : rows)
    .filter(row => row.some(c => String(c).trim()))
    .map((row, idx) => ({
      id:         String(row[0] || '').trim() || `prod_${idx}_${Date.now()}`,
      codigo:     String(row[0] || '').trim(),
      nombre:     String(row[1] || '').trim(),
      categoria:  normalizeCat(String(row[2] || '')),
      precio:     parseFloat(String(row[3] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0,
      stock:      String(row[4] || '').trim(),
      imagen:     String(row[5] || '').trim()
    }))
    .filter(p => p.nombre);

  if (!pendingProducts.length) { showToast('No se encontraron productos válidos'); return; }
  renderPreview();
  showToast(`✓ ${pendingProducts.length} productos listos para guardar`);
}

function normalizeCat(str) {
  const s = str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('papel')) return 'papeleria';
  if (s.includes('cotil') || s.includes('fiesta')) return 'cotillon';
  if (s.includes('bazar') || s.includes('hogar')) return 'bazar';
  if (s.includes('libr')) return 'libreria';
  if (s.includes('reposter') || s.includes('pastel') || s.includes('torta')) return 'reposteria';
  return s || 'sin categoría';
}

function renderPreview() {
  document.getElementById('previewWrap').style.display = 'block';
  document.getElementById('previewCount').textContent = pendingProducts.length;

  const tbody = document.getElementById('previewBody');
  tbody.innerHTML = pendingProducts.slice(0, 200).map(p => `
    <tr>
      <td>${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td><span class="cat-badge">${escapeHtml(CAT_LABELS[p.categoria] || p.categoria)}</span></td>
      <td>${p.precio ? '$' + p.precio.toLocaleString('es-AR', {minimumFractionDigits:2}) : '—'}</td>
      <td>${escapeHtml(p.stock)}</td>
    </tr>`).join('');

  if (pendingProducts.length > 200) {
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#999;padding:10px;">
      ...y ${pendingProducts.length - 200} productos más</td></tr>`;
  }
}

document.getElementById('saveProducts').addEventListener('click', async () => {
  if (!pendingProducts.length) return;
  document.getElementById('saveProducts').textContent = 'Guardando...';
  try {
    await saveToDatabase(pendingProducts);
    allAdminProducts = [...pendingProducts];
    showToast(`✓ ${pendingProducts.length} productos guardados`);
    renderStats();
    renderManageList();
    document.getElementById('manageSection').style.display = 'block';
    document.getElementById('previewWrap').style.display = 'none';
    pendingProducts = [];
    fileInput.value = '';
  } catch (err) {
    showToast('Error al guardar. Verificá la conexión y la configuración Firebase.');
    console.error(err);
  }
  document.getElementById('saveProducts').textContent = '💾 Guardar en el catálogo';
});

// ---- GESTIONAR PRODUCTOS ----
function renderManageList() {
  const search = (document.getElementById('manageSearch').value || '').toLowerCase();
  const cat = document.getElementById('manageCatFilter').value;

  let filtered = allAdminProducts;
  if (search) filtered = filtered.filter(p =>
    (p.nombre || '').toLowerCase().includes(search) ||
    (p.codigo || '').toLowerCase().includes(search)
  );
  if (cat) filtered = filtered.filter(p => p.categoria === cat);

  document.getElementById('manageCount').textContent =
    `${filtered.length} de ${allAdminProducts.length} productos`;

  const tbody = document.getElementById('manageBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.slice(0, 150).map(p => `
    <tr>
      <td>${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td><span class="cat-badge">${escapeHtml(CAT_LABELS[p.categoria] || p.categoria)}</span></td>
      <td>${p.precio ? '$' + p.precio.toLocaleString('es-AR', {minimumFractionDigits:2}) : '—'}</td>
      <td>${escapeHtml(p.stock)}</td>
      <td style="white-space:nowrap;">
        <button class="edit-btn" onclick="openEdit('${escapeHtml(p.id)}')">✏️ Editar</button>
        <button class="delete-btn" onclick="deleteProduct('${escapeHtml(p.id)}')">🗑 Borrar</button>
      </td>
    </tr>`).join('');
}

document.getElementById('manageSearch').addEventListener('input', renderManageList);
document.getElementById('manageCatFilter').addEventListener('change', renderManageList);

// ---- EDITAR PRODUCTO ----
function openEdit(id) {
  const p = allAdminProducts.find(x => x.id === id);
  if (!p) return;
  editingId = id;

  document.getElementById('editId').value = id;
  document.getElementById('editCodigo').value = p.codigo || '';
  document.getElementById('editNombre').value = p.nombre || '';
  document.getElementById('editCategoria').value = p.categoria || 'papeleria';
  document.getElementById('editPrecio').value = p.precio || '';
  document.getElementById('editStock').value = p.stock || '';
  document.getElementById('editImagen').value = p.imagen || '';

  document.getElementById('editModal').classList.add('open');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  editingId = null;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('editModal').addEventListener('click', e => {
  if (e.target === document.getElementById('editModal')) closeModal();
});

document.getElementById('editForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!editingId) return;

  const idx = allAdminProducts.findIndex(p => p.id === editingId);
  if (idx === -1) return;

  const updated = {
    ...allAdminProducts[idx],
    codigo:    document.getElementById('editCodigo').value.trim(),
    nombre:    document.getElementById('editNombre').value.trim(),
    categoria: document.getElementById('editCategoria').value,
    precio:    parseFloat(document.getElementById('editPrecio').value) || 0,
    stock:     document.getElementById('editStock').value.trim(),
    imagen:    document.getElementById('editImagen').value.trim()
  };

  allAdminProducts[idx] = updated;

  try {
    await saveToDatabase(allAdminProducts);
    showToast('✓ Producto actualizado');
    renderStats();
    renderManageList();
    closeModal();
  } catch (err) {
    showToast('Error al guardar. Verificá la conexión.');
    console.error(err);
  }
});

// ---- ELIMINAR PRODUCTO ----
async function deleteProduct(id) {
  const p = allAdminProducts.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;

  allAdminProducts = allAdminProducts.filter(x => x.id !== id);
  try {
    await saveToDatabase(allAdminProducts);
    showToast(`✓ "${p.nombre}" eliminado`);
    renderStats();
    renderManageList();
  } catch (err) {
    showToast('Error al eliminar.');
    console.error(err);
  }
}

// ---- ESTADÍSTICAS ----
function renderStats() {
  const grid = document.getElementById('statsGrid');
  if (!allAdminProducts.length) {
    grid.innerHTML = '<p style="color:#777;font-size:0.9rem;">No hay productos cargados aún.</p>';
    return;
  }

  const cats = { papeleria:0, cotillon:0, bazar:0, libreria:0, reposteria:0, otro:0 };
  allAdminProducts.forEach(p => {
    cats[p.categoria] !== undefined ? cats[p.categoria]++ : cats.otro++;
  });

  const icons = { papeleria:'📝', cotillon:'🎉', bazar:'🏠', libreria:'📚', reposteria:'🎂', otro:'📦' };
  const labels = { ...CAT_LABELS, otro: 'Otros' };

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">📦</div>
      <div class="stat-label">Total</div>
      <div class="stat-value">${allAdminProducts.length}</div>
    </div>
    ${Object.entries(cats).filter(([,v]) => v > 0).map(([cat, count]) => `
      <div class="stat-card">
        <div class="stat-icon">${icons[cat]}</div>
        <div class="stat-label">${labels[cat]}</div>
        <div class="stat-value">${count}</div>
      </div>`).join('')}`;
}

// ---- BORRAR TODO ----
document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (!confirm('¿Borrar TODOS los productos? Esta acción no se puede deshacer.')) return;
  allAdminProducts = [];
  try {
    await saveToDatabase([]);
    showToast('Catálogo eliminado');
    renderStats();
    renderManageList();
    document.getElementById('manageSection').style.display = 'none';
  } catch (err) {
    showToast('Error al eliminar.');
  }
});

// ---- PLANTILLA EXCEL ----
document.getElementById('downloadTemplate').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Código', 'Nombre del producto', 'Categoría', 'Precio', 'Stock', 'URL imagen (opcional)'],
    ['001', 'Cuaderno tapa dura A4', 'papeleria', 850, 50, ''],
    ['002', 'Globos de látex x10', 'cotillon', 320, 100, ''],
    ['003', 'Jarra 1 litro', 'bazar', 1200, 30, ''],
    ['004', 'Diccionario escolar', 'libreria', 2800, 20, ''],
    ['005', 'Molde de silicona redondo', 'reposteria', 950, 40, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [12, 28, 14, 10, 8, 30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla-distribuidora-avila.xlsx');
});

// ---- UTILS ----
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
