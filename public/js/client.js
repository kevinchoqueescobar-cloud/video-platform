// ===== CLIENT DASHBOARD =====

let currentUser = null;
let assignments = [];
let submissions = [];

// --- Auth check ---
async function init() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    currentUser = await res.json();
    if (currentUser.role !== 'client') { window.location.href = '/admin.html'; return; }

    const letter = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'C';
    document.getElementById('sidebarUserName').textContent = currentUser.name;
    document.getElementById('clientAvatarLetter').textContent = letter;

    loadTasks();
  } catch { window.location.href = '/'; }
}

// --- Tab navigation ---
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const tabTitles = { myTasks: 'Mis Tareas', mySubmissions: 'Mis Entregas' };

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`tab${capitalize(tab)}`).classList.add('active');
    document.getElementById('pageTitle').textContent = tabTitles[tab] || tab;
    closeSidebar();
    if (tab === 'myTasks') loadTasks();
    else if (tab === 'mySubmissions') loadMySubmissions();
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
  if (id === 'videoModal') {
    const v = document.getElementById('videoPlayer');
    v.pause(); v.src = '';
  }
  if (id === 'submitModal') {
    document.getElementById('submitForm').reset();
    document.getElementById('clientFileSelected').classList.add('hidden');
    document.getElementById('clientUploadProgress').classList.add('hidden');
    document.getElementById('submitError').classList.add('hidden');
    document.getElementById('submitSuccess').classList.add('hidden');
  }
}

// ===================== TASKS =====================
async function loadTasks() {
  assignments = await api('/api/client/assignments');
  renderTasks();
}

function renderTasks() {
  const container = document.getElementById('tasksContainer');
  const pending = assignments.filter(a => a.status !== 'completed');
  const completed = assignments.filter(a => a.status === 'completed');

  document.getElementById('pendingCount').textContent = pending.length;
  document.getElementById('completedCount').textContent = completed.length;

  if (!assignments.length) {
    container.innerHTML = '<div class="empty-state-card">📭 No tienes tareas asignadas aún. El administrador te asignará videos próximamente.</div>';
    return;
  }

  // Show pending first, then completed
  const sorted = [...pending, ...completed];
  container.innerHTML = sorted.map(a => `
    <div class="task-card ${a.status === 'completed' ? 'completed' : ''}">
      <div class="task-card-thumb" onclick="playVideo('/uploads/admin-videos/${a.filename}', '${esc(a.title)}')">
        <span class="thumb-icon">🎬</span>
      </div>
      <div class="task-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div class="task-title">${esc(a.title)}</div>
          <span class="status-badge ${a.status === 'completed' ? 'status-completed' : 'status-pending'}" style="flex-shrink:0">
            ${a.status === 'completed' ? '✓ Completado' : '⏳ Pendiente'}
          </span>
        </div>
        ${a.description ? `<div class="task-desc">${esc(a.description)}</div>` : ''}
        <div class="task-footer">
          <div class="task-date">
            📅 Asignado: ${formatDate(a.assigned_at)}
            ${a.last_submission ? `<br>📤 Última entrega: ${formatDate(a.last_submission)}` : ''}
          </div>
          <div class="task-actions">
            <button class="btn btn-sm btn-ghost" onclick="playVideo('/uploads/admin-videos/${a.filename}', '${esc(a.title)}')">▶ Ver tarea</button>
            <button class="btn btn-sm btn-primary" onclick="openSubmitModal(${a.id}, '${esc(a.title)}')">
              ${a.submissions_count > 0 ? '🔄 Re-entregar' : '📤 Entregar'}
            </button>
          </div>
        </div>
        ${a.submissions_count > 0 ? `<div style="font-size:12px;color:var(--accent-2);margin-top:6px">📎 ${a.submissions_count} entrega(s) realizadas</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ===================== SUBMIT VIDEO =====================
function openSubmitModal(assignmentId, title) {
  document.getElementById('submitAssignmentId').value = assignmentId;
  document.getElementById('submitTaskInfo').innerHTML = `<strong>Tarea:</strong> ${esc(title)}<br>Sube el video donde realizas esta tarea.`;
  document.getElementById('submitError').classList.add('hidden');
  document.getElementById('submitSuccess').classList.add('hidden');
  document.getElementById('clientFileSelected').classList.add('hidden');
  document.getElementById('submitForm').reset();
  openModal('submitModal');
}

setupDropZone('clientDropZone', 'clientVideoFile', 'clientFileSelected');

document.getElementById('submitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('clientVideoFile').files[0];
  if (!file) { showAlert('submitError', 'Selecciona un archivo de video'); return; }

  const assignmentId = document.getElementById('submitAssignmentId').value;
  const notes = document.getElementById('submitNotes').value;

  const formData = new FormData();
  formData.append('video', file);
  formData.append('assignment_id', assignmentId);
  formData.append('notes', notes);

  document.getElementById('submitBtn').disabled = true;
  document.getElementById('clientUploadProgress').classList.remove('hidden');
  document.getElementById('submitError').classList.add('hidden');
  document.getElementById('submitSuccess').classList.add('hidden');

  try {
    await uploadWithProgress('/api/client/submit', formData, 'clientProgressFill', 'clientProgressText');
    showAlert('submitSuccess', '✅ ¡Video entregado exitosamente! Tu entrega ha sido registrada con fecha y hora.');
    document.getElementById('submitBtn').disabled = false;
    loadTasks();
    setTimeout(() => closeModal('submitModal'), 2500);
  } catch (err) {
    showAlert('submitError', err.message || 'Error al enviar el video');
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('clientUploadProgress').classList.add('hidden');
  }
});

// ===================== MY SUBMISSIONS =====================
async function loadMySubmissions() {
  submissions = await api('/api/client/submissions');
  const tbody = document.getElementById('mySubmissionsBody');
  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aún no has realizado ninguna entrega</td></tr>';
    return;
  }
  tbody.innerHTML = submissions.map(s => `
    <tr>
      <td><strong>${esc(s.task_title)}</strong></td>
      <td style="font-size:12px;color:var(--text-secondary)">${esc(s.original_name)}</td>
      <td>${formatBytes(s.file_size)}</td>
      <td>${formatDate(s.submitted_at)}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="playVideo('/uploads/client-videos/${s.filename}', '${esc(s.task_title)}')">▶ Ver</button></td>
    </tr>
  `).join('');
}

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
