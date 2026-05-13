// ============================================================
// PANEL ADMIN — Distribuidora de Avila
// Carga de Excel · Gestión de productos · Stats
// ============================================================

const ADMIN_PASS = 'avila2025';
const STORAGE_KEY = 'davila_products';

let pendingProducts = [];

// ---- LOGIN ----
document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('passInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryLogin();
});

function tryLogin() {
  const val = document.getElementById('passInput').value;
  if (val === ADMIN_PASS) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    renderStats();
  } else {
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('passInput').value = '';
    document.getElementById('passInput').focus();
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
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

function processFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      parseRows(rows);
    } catch (err) {
      showToast('Error al leer el archivo. Verificá que sea un Excel válido.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseRows(rows) {
  if (!rows.length) { showToast('El archivo está vacío'); return; }

  // Detectar si la primera fila es encabezado
  const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
  const isHeader = firstRow.some(c =>
    ['codigo', 'código', 'nombre', 'producto', 'categoria', 'categoría', 'precio', 'stock'].includes(c)
  );

  const dataRows = isHeader ? rows.slice(1) : rows;

  pendingProducts = dataRows
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map((row, idx) => {
      const codigo    = String(row[0] || '').trim();
      const nombre    = String(row[1] || '').trim();
      const categoria = normalizeCat(String(row[2] || '').trim());
      const precio    = parseFloat(String(row[3] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      const stock     = String(row[4] || '').trim();
      const imagen    = String(row[5] || '').trim();

      return {
        id: codigo || `prod_${idx}_${Date.now()}`,
        codigo, nombre, categoria, precio, stock, imagen
      };
    })
    .filter(p => p.nombre); // requiere al menos nombre

  if (!pendingProducts.length) {
    showToast('No se encontraron productos válidos en el archivo');
    return;
  }

  renderPreview();
  showToast(`✓ ${pendingProducts.length} productos listos para guardar`);
}

function normalizeCat(str) {
  const s = str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('papel')) return 'papeleria';
  if (s.includes('cotil') || s.includes('fiesta')) return 'cotillon';
  if (s.includes('bazar') || s.includes('hogar')) return 'bazar';
  if (s.includes('libr') || s.includes('libro')) return 'libreria';
  if (s.includes('reposter') || s.includes('pastel') || s.includes('torta')) return 'reposteria';
  return s || 'sin categoría';
}

// ---- PREVIEW ----
const CAT_LABELS = {
  papeleria: 'Papelería', cotillon: 'Cotillón',
  bazar: 'Bazar', libreria: 'Librería', reposteria: 'Repostería'
};

function renderPreview() {
  document.getElementById('previewWrap').style.display = 'block';
  document.getElementById('previewCount').textContent = pendingProducts.length;

  const tbody = document.getElementById('previewBody');
  tbody.innerHTML = pendingProducts.slice(0, 200).map(p => `
    <tr>
      <td>${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td><span class="cat-badge">${escapeHtml(CAT_LABELS[p.categoria] || p.categoria)}</span></td>
      <td>${p.precio ? '$' + p.precio.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'}</td>
      <td>${escapeHtml(p.stock)}</td>
    </tr>`).join('');

  if (pendingProducts.length > 200) {
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#999;padding:12px;">
      ...y ${pendingProducts.length - 200} productos más
    </td></tr>`;
  }
}

// ---- GUARDAR ----
document.getElementById('saveProducts').addEventListener('click', () => {
  if (!pendingProducts.length) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingProducts));
    showToast(`✓ ${pendingProducts.length} productos guardados correctamente`);
    renderStats();
    document.getElementById('previewWrap').style.display = 'none';
    pendingProducts = [];
    fileInput.value = '';
  } catch (err) {
    showToast('Error al guardar. El archivo puede ser muy grande para el navegador.');
  }
});

// ---- ESTADÍSTICAS ----
function renderStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const products = raw ? JSON.parse(raw) : [];
    const grid = document.getElementById('statsGrid');

    if (!products.length) {
      grid.innerHTML = '<p style="color:#777;font-size:0.9rem;">No hay productos cargados aún.</p>';
      return;
    }

    const cats = {
      papeleria: 0, cotillon: 0, bazar: 0, libreria: 0, reposteria: 0, otro: 0
    };
    products.forEach(p => {
      if (cats[p.categoria] !== undefined) cats[p.categoria]++;
      else cats.otro++;
    });

    const icons = { papeleria:'📝', cotillon:'🎉', bazar:'🏠', libreria:'📚', reposteria:'🎂', otro:'📦' };
    const labels = { ...CAT_LABELS, otro: 'Otros' };

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-label">Total productos</div>
        <div class="stat-value">${products.length}</div>
      </div>
      ${Object.entries(cats).filter(([,v]) => v > 0).map(([cat, count]) => `
        <div class="stat-card">
          <div class="stat-icon">${icons[cat]}</div>
          <div class="stat-label">${labels[cat]}</div>
          <div class="stat-value">${count}</div>
        </div>`).join('')}`;
  } catch {}
}

// ---- BORRAR TODO ----
document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (!confirm('¿Seguro que querés borrar TODOS los productos? Esta acción no se puede deshacer.')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderStats();
  showToast('Catálogo eliminado');
});

// ---- DESCARGAR PLANTILLA ----
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
  ws['!cols'] = [14,28,14,10,8,30].map(w => ({ wch: w }));
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
