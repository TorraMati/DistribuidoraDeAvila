// ============================================================
// PANEL ADMIN — Distribuidora de Avila (Supabase)
// ============================================================

const ADMIN_PASS    = 'avila2025';
const STORAGE_KEY   = 'davila_products';
const IMG_BUCKET    = 'product-images';
const CAT_LABELS = {
  papeleria: 'Papelería', cotillon: 'Cotillón',
  bazar: 'Bazar', libreria: 'Librería', reposteria: 'Repostería'
};

let allAdminProducts = [];
let pendingProducts  = [];
let editingId        = null;
let pendingImageFile = null;  // foto seleccionada en el modal

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
  document.getElementById('adminPanel').style.display  = 'block';
  if (!window.SUPABASE_CONFIGURED) {
    document.getElementById('supabaseBanner').style.display = 'flex';
  }
  await loadAdminProducts();
}

// ---- CARGA ----
async function loadAdminProducts() {
  try {
    if (window.SUPABASE_CONFIGURED && window.db) {
      const { data, error } = await window.db.from('products').select('*').order('nombre');
      if (error) throw error;
      allAdminProducts = data || [];
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
  document.getElementById('manageSection').style.display = allAdminProducts.length ? 'block' : 'none';
}

// ---- GUARDAR EN BASE DE DATOS ----
async function saveToDatabase(products) {
  if (window.SUPABASE_CONFIGURED && window.db) {

    showProgress('Borrando catálogo anterior…', 0);

    // Obtener TODOS los IDs actuales con paginación (Supabase limita a 1000 por consulta)
    let existingIds = [];
    let from = 0;
    while (true) {
      const { data } = await window.db.from('products').select('id').range(from, from + 999);
      if (!data || data.length === 0) break;
      existingIds.push(...data.map(r => r.id));
      if (data.length < 1000) break;
      from += 1000;
    }

    // Borrar en lotes de 200
    for (let i = 0; i < existingIds.length; i += 200) {
      await window.db.from('products').delete().in('id', existingIds.slice(i, i + 200));
    }

    // Insertar en lotes de 100 (evita límite de tamaño de payload)
    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < products.length; i += BATCH) {
      const { error } = await window.db.from('products').insert(products.slice(i, i + BATCH));
      if (error) {
        console.error(`Error en lote ${i}–${i + BATCH}:`, error);
        // Continúa con el siguiente lote en lugar de abortar
      } else {
        inserted += Math.min(BATCH, products.length - i);
      }
      const pct = Math.round((i + BATCH) / products.length * 100);
      showProgress(`Subiendo productos… ${Math.min(inserted, products.length)} de ${products.length}`, pct);
    }

    hideProgress();

  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }
}

// Guardar/actualizar un solo producto
async function saveOneProduct(product) {
  if (window.SUPABASE_CONFIGURED && window.db) {
    const { error } = await window.db.from('products').upsert(product, { onConflict: 'id' });
    if (error) throw error;
  } else {
    const idx = allAdminProducts.findIndex(p => p.id === product.id);
    if (idx !== -1) allAdminProducts[idx] = product;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allAdminProducts));
  }
}

async function deleteOneProduct(id) {
  if (window.SUPABASE_CONFIGURED && window.db) {
    const { error } = await window.db.from('products').delete().eq('id', id);
    if (error) throw error;
  } else {
    allAdminProducts = allAdminProducts.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allAdminProducts));
  }
}

// ---- DROP ZONE (EXCEL) ----
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
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
    } catch { showToast('Error al leer el archivo.'); }
  };
  reader.readAsArrayBuffer(file);
}

function parseRows(rows) {
  if (!rows.length) { showToast('El archivo está vacío'); return; }
  const first = rows[0].map(c => String(c).toLowerCase().trim());
  const isHeader = first.some(c => ['codigo','código','nombre','precio','categoria','categoría','stock'].includes(c));

  pendingProducts = (isHeader ? rows.slice(1) : rows)
    .filter(row => row.some(c => String(c).trim()))
    .map((row, idx) => ({
      id:        String(row[0] || '').trim() || `prod_${idx}_${Date.now()}`,
      codigo:    String(row[0] || '').trim(),
      nombre:    String(row[1] || '').trim(),
      categoria: normalizeCat(String(row[2] || '')),
      precio:    parseFloat(String(row[3] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0,
      stock:     String(row[4] || '').trim(),
      imagen:    String(row[5] || '').trim()
    }))
    .filter(p => p.nombre);

  if (!pendingProducts.length) { showToast('No se encontraron productos válidos'); return; }
  renderPreview();
  showToast(`✓ ${pendingProducts.length} productos listos`);
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
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#999;padding:10px;">...y ${pendingProducts.length - 200} más</td></tr>`;
  }
}

document.getElementById('saveProducts').addEventListener('click', async () => {
  if (!pendingProducts.length) return;
  const btn = document.getElementById('saveProducts');
  btn.textContent = 'Guardando...'; btn.disabled = true;
  try {
    await saveToDatabase(pendingProducts);
    allAdminProducts = [...pendingProducts];
    showToast(`✓ ${pendingProducts.length} productos guardados`);
    renderStats(); renderManageList();
    document.getElementById('manageSection').style.display = 'block';
    document.getElementById('previewWrap').style.display = 'none';
    pendingProducts = []; fileInput.value = '';
  } catch (err) {
    showToast('Error al guardar. Verificá Supabase.');
    console.error(err);
  }
  btn.textContent = '💾 Guardar catálogo'; btn.disabled = false;
});

// ---- GESTIONAR PRODUCTOS ----
function renderManageList() {
  const search = (document.getElementById('manageSearch').value || '').toLowerCase();
  const cat    = document.getElementById('manageCatFilter').value;

  let filtered = allAdminProducts;
  if (search) filtered = filtered.filter(p =>
    (p.nombre||'').toLowerCase().includes(search) || (p.codigo||'').toLowerCase().includes(search)
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
  pendingImageFile = null;

  document.getElementById('editId').value       = id;
  document.getElementById('editCodigo').value   = p.codigo    || '';
  document.getElementById('editNombre').value   = p.nombre    || '';
  document.getElementById('editCategoria').value = p.categoria || 'papeleria';
  document.getElementById('editPrecio').value   = p.precio    || '';
  document.getElementById('editStock').value    = p.stock     || '';
  document.getElementById('editImagen').value   = p.imagen    || '';

  // Preview imagen existente
  const preview = document.getElementById('editImagePreview');
  if (p.imagen) {
    preview.src = p.imagen;
    preview.classList.add('visible');
  } else {
    preview.classList.remove('visible');
    preview.src = '';
  }
  document.getElementById('editImageFile').value = '';

  document.getElementById('editModal').classList.add('open');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  editingId = null; pendingImageFile = null;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('editModal').addEventListener('click', e => {
  if (e.target === document.getElementById('editModal')) closeModal();
});

// Captura de foto/imagen en el modal
document.getElementById('editImageFile').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  pendingImageFile = file;
  const preview = document.getElementById('editImagePreview');
  preview.src = URL.createObjectURL(file);
  preview.classList.add('visible');
  document.getElementById('editImagen').value = '';  // Limpiar URL manual si elige foto
});

document.getElementById('editForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!editingId) return;

  const btn = document.getElementById('saveEditBtn');
  btn.textContent = 'Guardando...'; btn.disabled = true;

  try {
    // Imagen: prioridad → URL manual → Storage → base64 comprimida → imagen existente
    const existingUrl = (allAdminProducts.find(p => p.id === editingId) || {}).imagen || '';
    let imageUrl = document.getElementById('editImagen').value.trim() || existingUrl;

    if (pendingImageFile) {
      let uploaded = false;

      // Intentar subir a Supabase Storage
      if (window.SUPABASE_CONFIGURED && window.db) {
        const ext = pendingImageFile.name.split('.').pop() || 'jpg';
        const filename = `${editingId}_${Date.now()}.${ext}`;
        const { error: uploadErr } = await window.db.storage
          .from(IMG_BUCKET)
          .upload(filename, pendingImageFile, { upsert: true, contentType: pendingImageFile.type });
        if (!uploadErr) {
          const { data: urlData } = window.db.storage.from(IMG_BUCKET).getPublicUrl(filename);
          imageUrl = urlData.publicUrl;
          uploaded = true;
        }
      }

      // Fallback: comprimir a base64 (funciona sin Storage)
      if (!uploaded) {
        imageUrl = await compressToBase64(pendingImageFile, 700, 0.65);
      }
    }

    const updated = {
      id:        editingId,
      codigo:    document.getElementById('editCodigo').value.trim(),
      nombre:    document.getElementById('editNombre').value.trim(),
      categoria: document.getElementById('editCategoria').value,
      precio:    parseFloat(document.getElementById('editPrecio').value) || 0,
      stock:     document.getElementById('editStock').value.trim(),
      imagen:    imageUrl
    };

    // Actualizar en el array local
    const idx = allAdminProducts.findIndex(p => p.id === editingId);
    if (idx !== -1) allAdminProducts[idx] = updated;

    await saveOneProduct(updated);
    showToast('✓ Producto actualizado');
    renderStats(); renderManageList();
    closeModal();
  } catch (err) {
    showToast('Error al guardar.');
    console.error(err);
  }
  btn.textContent = '💾 Guardar cambios'; btn.disabled = false;
});

// ---- ELIMINAR PRODUCTO ----
async function deleteProduct(id) {
  const p = allAdminProducts.find(x => x.id === id);
  if (!p || !confirm(`¿Eliminar "${p.nombre}"?`)) return;
  try {
    await deleteOneProduct(id);
    allAdminProducts = allAdminProducts.filter(x => x.id !== id);
    showToast(`✓ "${p.nombre}" eliminado`);
    renderStats(); renderManageList();
    if (!allAdminProducts.length) document.getElementById('manageSection').style.display = 'none';
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
  allAdminProducts.forEach(p => { cats[p.categoria] !== undefined ? cats[p.categoria]++ : cats.otro++; });
  const icons = { papeleria:'📝', cotillon:'🎉', bazar:'🏠', libreria:'📚', reposteria:'🎂', otro:'📦' };
  const labels = { ...CAT_LABELS, otro:'Otros' };

  grid.innerHTML = `
    <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-label">Total</div><div class="stat-value">${allAdminProducts.length}</div></div>
    ${Object.entries(cats).filter(([,v]) => v > 0).map(([cat, count]) => `
      <div class="stat-card">
        <div class="stat-icon">${icons[cat]}</div>
        <div class="stat-label">${labels[cat]}</div>
        <div class="stat-value">${count}</div>
      </div>`).join('')}`;
}

// ---- BORRAR TODO ----
document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (!confirm('¿Borrar TODOS los productos? No se puede deshacer.')) return;
  try {
    await saveToDatabase([]);
    allAdminProducts = [];
    showToast('Catálogo eliminado');
    renderStats(); renderManageList();
    document.getElementById('manageSection').style.display = 'none';
  } catch (err) { showToast('Error al eliminar.'); }
});

// ---- PLANTILLA EXCEL ----
document.getElementById('downloadTemplate').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Código','Nombre del producto','Categoría','Precio','Stock','URL imagen (opcional)'],
    ['001','Cuaderno tapa dura A4','papeleria',850,50,''],
    ['002','Globos de látex x10','cotillon',320,100,''],
    ['003','Jarra 1 litro','bazar',1200,30,''],
    ['004','Diccionario escolar','libreria',2800,20,''],
    ['005','Molde de silicona redondo','reposteria',950,40,''],
  ]);
  ws['!cols'] = [12,28,14,10,8,30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla-distribuidora-avila.xlsx');
});

// ---- BARRA DE PROGRESO ----
function showProgress(msg, pct) {
  let wrap = document.getElementById('progressWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'progressWrap';
    wrap.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:500;background:var(--dark);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:14px;font-family:inherit;font-size:0.9rem;';
    wrap.innerHTML = `<span id="progressMsg"></span>
      <div style="flex:1;background:rgba(255,255,255,0.2);border-radius:50px;height:8px;">
        <div id="progressBar" style="height:100%;background:var(--green);border-radius:50px;transition:width 0.3s;width:0%"></div>
      </div>
      <span id="progressPct" style="min-width:36px;text-align:right;font-weight:700;color:var(--green);">0%</span>`;
    document.body.prepend(wrap);
  }
  document.getElementById('progressMsg').textContent = msg;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
}
function hideProgress() {
  const wrap = document.getElementById('progressWrap');
  if (wrap) wrap.remove();
}

// ---- COMPRIMIR IMAGEN A BASE64 (fallback sin Storage) ----
function compressToBase64(file, maxWidth = 700, quality = 0.65) {
  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(''); };
    img.src = blobUrl;
  });
}

// ---- UTILS ----
function escapeHtml(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
