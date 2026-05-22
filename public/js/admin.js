// ===== ADMIN DASHBOARD =====

let currentUser = null;
let allClients = [];
let allVideos = [];
let allAssignments = [];

// --- Auth check ---
async function init() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    currentUser = await res.json();
    if (currentUser.role !== 'admin') { window.location.href = '/client.html'; return; }
    document.getElementById('adminName').textContent = currentUser.name;
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    loadDashboard();
  } catch { window.location.href = '/'; }
}

// --- Tab navigation ---
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const tabTitles = { dashboard: 'Dashboard', clients: 'Clientes', videos: 'Videos', assignments: 'Asignaciones', submissions: 'Entregas' };

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`tab${capitalize(tab)}`).classList.add('active');
    document.getElementById('pageTitle').textContent = tabTitles[tab] || tab;
    closeSidebar();
    if (tab === 'clients') loadClients();
    else if (tab === 'videos') loadVideos();
    else if (tab === 'assignments') loadAssignments();
    else if (tab === 'submissions') loadSubmissions();
    else if (tab === 'dashboard') loadDashboard();
  });
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// --- Sidebar mobile ---
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('active');
});
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// --- Logout ---
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

// --- Modals ---
document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal || btn.closest('.modal-overlay').id));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
});
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  // Stop video if playing
  if (id === 'videoModal') {
    const v = document.getElementById('videoPlayer');
    v.pause(); v.src = '';
  }
}

// ===================== DASHBOARD =====================
async function loadDashboard() {
  const [clients, videos, assignments, submissions] = await Promise.all([
    api('/api/admin/clients'),
    api('/api/admin/videos'),
    api('/api/admin/assignments'),
    api('/api/admin/submissions')
  ]);
  document.getElementById('statClients').textContent = clients.length;
  document.getElementById('statVideos').textContent = videos.length;
  document.getElementById('statAssignments').textContent = assignments.length;
  document.getElementById('statSubmissions').textContent = submissions.length;

  const tbody = document.getElementById('recentSubmissionsBody');
  const recent = submissions.slice(0, 8);
  if (!recent.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Sin entregas aún</td></tr>'; return; }
  tbody.innerHTML = recent.map(s => `
    <tr>
      <td><strong>${esc(s.client_name)}</strong><br><small style="color:var(--text-muted)">${esc(s.client_username)}</small></td>
      <td>${esc(s.task_title)}</td>
      <td>${formatDate(s.submitted_at)}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="playVideo('/uploads/client-videos/${s.filename}', '${esc(s.task_title)}')">▶ Ver</button></td>
    </tr>
  `).join('');
}

// ===================== CLIENTS =====================
async function loadClients() {
  allClients = await api('/api/admin/clients');
  renderClients();
}

function renderClients() {
  const tbody = document.getElementById('clientsTableBody');
  if (!allClients.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay clientes registrados</td></tr>';
    return;
  }
  tbody.innerHTML = allClients.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.phone)}</td>
      <td><code style="background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:4px">${esc(c.username)}</code></td>
      <td><span class="status-badge status-completed">${c.assigned_videos}</span></td>
      <td><span class="status-badge status-completed">${c.submitted_videos}</span></td>
      <td>
        <span class="status-badge ${c.active ? 'status-active' : 'status-inactive'}">
          ${c.active ? '● Activo' : '● Inactivo'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost" onclick="toggleClient(${c.id}, ${c.active})" title="${c.active ? 'Desactivar' : 'Activar'}">${c.active ? '🔒' : '🔓'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id}, '${esc(c.name)}')" title="Eliminar">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('openRegisterModal').addEventListener('click', () => {
  document.getElementById('registerForm').reset();
  document.getElementById('credentialsPreview').classList.add('hidden');
  document.getElementById('registerError').classList.add('hidden');
  document.getElementById('registerSuccess').classList.add('hidden');
  openModal('registerModal');
});

// Preview credentials as user types
document.getElementById('regName').addEventListener('input', updateCredPreview);
document.getElementById('regPhone').addEventListener('input', updateCredPreview);
function updateCredPreview() {
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  if (name.length > 1 && phone.length >= 4) {
    const username = name.toLowerCase().replace(/\s+/g, '.');
    const pass = phone.substring(0, 4);
    document.getElementById('prevUser').textContent = username;
    document.getElementById('prevPass').textContent = pass;
    document.getElementById('credentialsPreview').classList.remove('hidden');
  } else {
    document.getElementById('credentialsPreview').classList.add('hidden');
  }
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  document.getElementById('registerError').classList.add('hidden');
  document.getElementById('registerSuccess').classList.add('hidden');
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Registrando...';

  const res = await fetch('/api/admin/clients', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone })
  });
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Registrar';

  if (!res.ok) {
    document.getElementById('registerError').textContent = data.error;
    document.getElementById('registerError').classList.remove('hidden');
    return;
  }
  document.getElementById('registerSuccess').innerHTML = `
    ✅ Cliente registrado exitosamente<br>
    <strong>Usuario:</strong> ${esc(data.client.username)}<br>
    <strong>Contraseña:</strong> ${esc(data.client.password)}
  `;
  document.getElementById('registerSuccess').classList.remove('hidden');
  document.getElementById('registerForm').reset();
  document.getElementById('credentialsPreview').classList.add('hidden');
  loadClients();
  populateClientSelects();
});

async function toggleClient(id, currentActive) {
  await fetch(`/api/admin/clients/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !currentActive })
  });
  loadClients();
}

async function deleteClient(id, name) {
  if (!confirm(`¿Eliminar al cliente "${name}"? Esta acción es irreversible.`)) return;
  await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
  loadClients();
  populateClientSelects();
}

// ===================== VIDEOS =====================
async function loadVideos() {
  allVideos = await api('/api/admin/videos');
  renderVideos();
}

function renderVideos() {
  const grid = document.getElementById('adminVideoGrid');
  if (!allVideos.length) {
    grid.innerHTML = '<div class="empty-state-card">No hay videos subidos aún. ¡Sube el primero!</div>';
    return;
  }
  grid.innerHTML = allVideos.map(v => `
    <div class="video-card">
      <div class="video-thumb" onclick="playVideo('/uploads/admin-videos/${v.filename}', '${esc(v.title)}')">
        <span class="video-thumb-icon">🎬</span>
      </div>
      <div class="video-info">
        <div class="video-title">${esc(v.title)}</div>
        ${v.description ? `<div class="video-desc">${esc(v.description)}</div>` : ''}
        <div class="video-meta">
          <span>📁 ${formatBytes(v.file_size)}</span>
          <span>👥 ${v.assigned_count} asignado(s)</span>
          <span>📅 ${formatDate(v.uploaded_at)}</span>
        </div>
        <div class="video-actions">
          <button class="btn btn-sm btn-ghost" onclick="playVideo('/uploads/admin-videos/${v.filename}', '${esc(v.title)}')">▶ Ver</button>
          <button class="btn btn-sm btn-danger" onclick="deleteVideo(${v.id}, '${esc(v.title)}')">🗑 Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');
}

document.getElementById('openUploadModal').addEventListener('click', () => {
  document.getElementById('uploadForm').reset();
  document.getElementById('adminFileSelected').classList.add('hidden');
  document.getElementById('adminUploadProgress').classList.add('hidden');
  document.getElementById('uploadError').classList.add('hidden');
  document.getElementById('uploadSuccess').classList.add('hidden');
  openModal('uploadModal');
});

// Drop zone
setupDropZone('adminDropZone', 'adminVideoFile', 'adminFileSelected');

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('adminVideoFile').files[0];
  if (!file) { showAlert('uploadError', 'Selecciona un archivo de video'); return; }

  const title = document.getElementById('videoTitle').value.trim();
  if (!title) { showAlert('uploadError', 'El título es requerido'); return; }

  const formData = new FormData();
  formData.append('video', file);
  formData.append('title', title);
  formData.append('description', document.getElementById('videoDesc').value);

  document.getElementById('uploadBtn').disabled = true;
  document.getElementById('adminUploadProgress').classList.remove('hidden');
  document.getElementById('uploadError').classList.add('hidden');
  document.getElementById('uploadSuccess').classList.add('hidden');

  try {
    await uploadWithProgress('/api/admin/videos', formData, 'adminProgressFill', 'adminProgressText');
    showAlert('uploadSuccess', '✅ Video subido exitosamente');
    document.getElementById('uploadForm').reset();
    document.getElementById('adminFileSelected').classList.add('hidden');
    loadVideos();
    populateVideoSelect();
  } catch (err) {
    showAlert('uploadError', err.message || 'Error al subir el video');
  } finally {
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('adminUploadProgress').classList.add('hidden');
  }
});

async function deleteVideo(id, title) {
  if (!confirm(`¿Eliminar el video "${title}"? Se eliminarán también sus asignaciones.`)) return;
  await fetch(`/api/admin/videos/${id}`, { method: 'DELETE' });
  loadVideos();
}

// ===================== ASSIGNMENTS =====================
async function loadAssignments() {
  const clientId = document.getElementById('filterClient').value;
  const url = clientId ? `/api/admin/assignments?client_id=${clientId}` : '/api/admin/assignments';
  allAssignments = await api(url);
  renderAssignments();
  await populateClientSelects();
}

function renderAssignments() {
  const tbody = document.getElementById('assignmentsTableBody');
  if (!allAssignments.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin asignaciones aún</td></tr>';
    return;
  }
  tbody.innerHTML = allAssignments.map(a => `
    <tr>
      <td><strong>${esc(a.client_name)}</strong><br><small style="color:var(--text-muted)">${esc(a.client_username)}</small></td>
      <td>${esc(a.video_title)}</td>
      <td>${formatDate(a.assigned_at)}</td>
      <td><span class="status-badge ${a.status === 'completed' ? 'status-completed' : 'status-pending'}">${a.status === 'completed' ? '✓ Completado' : '⏳ Pendiente'}</span></td>
      <td>${a.submissions_count}</td>
      <td><button class="btn btn-sm btn-danger" onclick="removeAssignment(${a.id})">✕ Quitar</button></td>
    </tr>
  `).join('');
}

document.getElementById('filterClient').addEventListener('change', loadAssignments);

document.getElementById('openAssignModal').addEventListener('click', async () => {
  document.getElementById('assignError').classList.add('hidden');
  document.getElementById('assignSuccess').classList.add('hidden');
  await populateVideoSelect();
  await populateClientChecklist();
  openModal('assignModal');
});

async function populateVideoSelect() {
  const videos = await api('/api/admin/videos');
  const sel = document.getElementById('assignVideoSelect');
  sel.innerHTML = '<option value="">-- Seleccionar video --</option>' +
    videos.map(v => `<option value="${v.id}">${esc(v.title)}</option>`).join('');
}

async function populateClientChecklist() {
  const clients = await api('/api/admin/clients');
  const list = document.getElementById('clientChecklist');
  if (!clients.length) { list.innerHTML = '<div style="padding:12px;color:var(--text-muted)">No hay clientes registrados</div>'; return; }
  list.innerHTML = clients.filter(c => c.active).map(c => `
    <div class="client-check-item">
      <input type="checkbox" id="cc_${c.id}" value="${c.id}"/>
      <label for="cc_${c.id}">${esc(c.name)} <small style="color:var(--text-muted)">(${esc(c.username)})</small></label>
    </div>
  `).join('');
}

async function populateClientSelects() {
  allClients = await api('/api/admin/clients');
  const options = '<option value="">Todos los clientes</option>' +
    allClients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('filterClient').innerHTML = options;
  document.getElementById('filterSubmissionClient').innerHTML = options;
}

document.getElementById('assignBtn').addEventListener('click', async () => {
  const videoId = parseInt(document.getElementById('assignVideoSelect').value);
  const checked = [...document.querySelectorAll('#clientChecklist input:checked')].map(el => parseInt(el.value));
  if (!videoId) { showAlert('assignError', 'Selecciona un video'); return; }
  if (!checked.length) { showAlert('assignError', 'Selecciona al menos un cliente'); return; }

  const res = await fetch('/api/admin/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId, client_ids: checked })
  });
  if (res.ok) {
    showAlert('assignSuccess', `✅ Video asignado a ${checked.length} cliente(s)`);
    loadAssignments();
    loadDashboard();
  } else {
    const d = await res.json();
    showAlert('assignError', d.error);
  }
});

async function removeAssignment(id) {
  if (!confirm('¿Quitar esta asignación?')) return;
  await fetch(`/api/admin/assign/${id}`, { method: 'DELETE' });
  loadAssignments();
}

// ===================== SUBMISSIONS =====================
async function loadSubmissions() {
  const clientId = document.getElementById('filterSubmissionClient').value;
  const url = clientId ? `/api/admin/submissions?client_id=${clientId}` : '/api/admin/submissions';
  const submissions = await api(url);
  const tbody = document.getElementById('submissionsTableBody');
  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin entregas aún</td></tr>';
    return;
  }
  tbody.innerHTML = submissions.map(s => `
    <tr>
      <td><strong>${esc(s.client_name)}</strong></td>
      <td>${esc(s.task_title)}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${esc(s.original_name)}</td>
      <td>${formatBytes(s.file_size)}</td>
      <td>${formatDate(s.submitted_at)}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="playVideo('/uploads/client-videos/${s.filename}', '${esc(s.client_name)} - ${esc(s.task_title)}')">▶ Ver</button></td>
    </tr>
  `).join('');
}

document.getElementById('filterSubmissionClient').addEventListener('change', loadSubmissions);

// ===================== VIDEO PLAYER =====================
function playVideo(src, title) {
  document.getElementById('videoModalTitle').textContent = title || 'Video';
  const player = document.getElementById('videoPlayer');
  player.src = src;
  player.load();
  openModal('videoModal');
  player.play();
}

// ===================== UTILITIES =====================
async function api(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) { if (res.status === 401) { window.location.href = '/'; } return []; }
    return await res.json();
  } catch { return []; }
}

function uploadWithProgress(url, formData, fillId, textId) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        document.getElementById(fillId).style.width = pct + '%';
        document.getElementById(textId).textContent = `Subiendo... ${pct}%`;
      }
    });
    xhr.addEventListener('load', () => {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Error al subir'));
    });
    xhr.addEventListener('error', () => reject(new Error('Error de red')));
    xhr.send(formData);
  });
}

function setupDropZone(zoneId, inputId, selectedId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const selected = document.getElementById(selectedId);

  input.addEventListener('change', () => {
    if (input.files[0]) showSelected(input.files[0], selected);
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      showSelected(file, selected);
    }
  });
}

function showSelected(file, el) {
  const mb = (file.size / 1024 / 1024).toFixed(2);
  if (file.size > 50 * 1024 * 1024) {
    el.innerHTML = `⚠️ Archivo demasiado grande: ${mb}MB (máx. 50MB)`;
    el.style.background = 'rgba(239,68,68,0.1)';
    el.style.borderColor = 'rgba(239,68,68,0.3)';
    el.style.color = '#fca5a5';
  } else {
    el.innerHTML = `✅ ${esc(file.name)} — ${mb}MB`;
    el.style.background = '';
    el.style.borderColor = '';
    el.style.color = '';
  }
  el.classList.remove('hidden');
}

function showAlert(id, msg) {
  const el = document.getElementById(id);
  el.innerHTML = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function formatDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Start
init();
