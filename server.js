const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-create upload directories (needed for cloud deployments)
const uploadDirs = ['uploads/admin-videos', 'uploads/client-videos'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'videoplatform_secret_2024_xK9mL',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}
function requireClient(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'client') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// Multer config for admin videos
const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads/admin-videos')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const clientStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads/client-videos')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const uploadAdmin = multer({
  storage: adminStorage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mov|avi|mkv|webm|wmv|flv|m4v/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Solo se permiten archivos de video'));
  }
});

const uploadClient = multer({
  storage: clientStorage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mov|avi|mkv|webm|wmv|flv|m4v/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Solo se permiten archivos de video'));
  }
});

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Campos requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username.trim());
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  req.session.user = { id: user.id, name: user.name, username: user.username, role: user.role };
  res.json({ success: true, role: user.role, name: user.name });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current session
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// ==================== ADMIN ROUTES ====================

// Register new client
app.post('/api/admin/clients', requireAdmin, (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Nombre y teléfono requeridos' });

  const username = name.trim().toLowerCase().replace(/\s+/g, '.');
  const rawPassword = phone.trim().substring(0, 4);
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: `El usuario "${username}" ya existe. Intenta con un nombre diferente.` });

    const result = db.prepare(`
      INSERT INTO users (name, phone, username, password, role)
      VALUES (?, ?, ?, ?, 'client')
    `).run(name.trim(), phone.trim(), username, hashedPassword);

    res.json({ success: true, client: { id: result.lastInsertRowid, name: name.trim(), username, password: rawPassword } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all clients
app.get('/api/admin/clients', requireAdmin, (req, res) => {
  const clients = db.prepare(`
    SELECT u.id, u.name, u.phone, u.username, u.created_at, u.active,
      COUNT(DISTINCT va.id) as assigned_videos,
      COUNT(DISTINCT cs.id) as submitted_videos
    FROM users u
    LEFT JOIN video_assignments va ON va.client_id = u.id
    LEFT JOIN client_submissions cs ON cs.client_id = u.id
    WHERE u.role = 'client'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(clients);
});

// Toggle client active
app.patch('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const { active } = req.body;
  db.prepare('UPDATE users SET active = ? WHERE id = ? AND role = "client"').run(active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// Delete client
app.delete('/api/admin/clients/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ? AND role = "client"').run(req.params.id);
  res.json({ success: true });
});

// Upload admin video
app.post('/api/admin/videos', requireAdmin, uploadAdmin.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún video' });
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'El título es requerido' });

  const result = db.prepare(`
    INSERT INTO admin_videos (title, description, filename, original_name, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, description || '', req.file.filename, req.file.originalname, req.file.size, req.session.user.id);

  res.json({ success: true, video: { id: result.lastInsertRowid, title, filename: req.file.filename } });
}, (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo supera los 50MB permitidos' });
  res.status(400).json({ error: err.message });
});

// Get all admin videos
app.get('/api/admin/videos', requireAdmin, (req, res) => {
  const videos = db.prepare(`
    SELECT av.*, COUNT(va.id) as assigned_count
    FROM admin_videos av
    LEFT JOIN video_assignments va ON va.admin_video_id = av.id
    GROUP BY av.id
    ORDER BY av.uploaded_at DESC
  `).all();
  res.json(videos);
});

// Delete admin video
app.delete('/api/admin/videos/:id', requireAdmin, (req, res) => {
  const video = db.prepare('SELECT * FROM admin_videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video no encontrado' });

  const filePath = path.join(__dirname, 'uploads/admin-videos', video.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM video_assignments WHERE admin_video_id = ?').run(req.params.id);
  db.prepare('DELETE FROM admin_videos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Assign video to client(s)
app.post('/api/admin/assign', requireAdmin, (req, res) => {
  const { video_id, client_ids } = req.body;
  if (!video_id || !client_ids || !client_ids.length) return res.status(400).json({ error: 'Datos incompletos' });

  const insert = db.prepare(`
    INSERT OR IGNORE INTO video_assignments (admin_video_id, client_id, assigned_by)
    VALUES (?, ?, ?)
  `);
  const assignMany = db.transaction((ids) => {
    ids.forEach(cid => insert.run(video_id, cid, req.session.user.id));
  });
  assignMany(client_ids);
  res.json({ success: true });
});

// Remove assignment
app.delete('/api/admin/assign/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM video_assignments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get assignments (optionally by client)
app.get('/api/admin/assignments', requireAdmin, (req, res) => {
  const { client_id } = req.query;
  let query = `
    SELECT va.id, va.assigned_at, va.status,
      av.title as video_title, av.filename as video_filename, av.description,
      u.name as client_name, u.username as client_username, u.id as client_id,
      COUNT(cs.id) as submissions_count
    FROM video_assignments va
    JOIN admin_videos av ON av.id = va.admin_video_id
    JOIN users u ON u.id = va.client_id
    LEFT JOIN client_submissions cs ON cs.assignment_id = va.id
  `;
  const params = [];
  if (client_id) { query += ' WHERE va.client_id = ?'; params.push(client_id); }
  query += ' GROUP BY va.id ORDER BY va.assigned_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get client submissions (admin view)
app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const { client_id } = req.query;
  let query = `
    SELECT cs.*, u.name as client_name, u.username as client_username,
      av.title as task_title, va.id as assignment_id
    FROM client_submissions cs
    JOIN users u ON u.id = cs.client_id
    JOIN video_assignments va ON va.id = cs.assignment_id
    JOIN admin_videos av ON av.id = va.admin_video_id
  `;
  const params = [];
  if (client_id) { query += ' WHERE cs.client_id = ?'; params.push(client_id); }
  query += ' ORDER BY cs.submitted_at DESC';
  res.json(db.prepare(query).all(...params));
});

// ==================== CLIENT ROUTES ====================

// Get my assigned videos
app.get('/api/client/assignments', requireClient, (req, res) => {
  const assignments = db.prepare(`
    SELECT va.id, va.assigned_at, va.status,
      av.id as video_id, av.title, av.description, av.filename,
      COUNT(cs.id) as submissions_count,
      MAX(cs.submitted_at) as last_submission
    FROM video_assignments va
    JOIN admin_videos av ON av.id = va.admin_video_id
    LEFT JOIN client_submissions cs ON cs.assignment_id = va.id AND cs.client_id = ?
    WHERE va.client_id = ?
    GROUP BY va.id
    ORDER BY va.assigned_at DESC
  `).all(req.session.user.id, req.session.user.id);
  res.json(assignments);
});

// Submit a video response
app.post('/api/client/submit', requireClient, uploadClient.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún video' });
  const { assignment_id, notes } = req.body;
  if (!assignment_id) return res.status(400).json({ error: 'ID de tarea requerido' });

  const assignment = db.prepare('SELECT * FROM video_assignments WHERE id = ? AND client_id = ?')
    .get(assignment_id, req.session.user.id);
  if (!assignment) return res.status(404).json({ error: 'Tarea no encontrada' });

  db.prepare(`
    INSERT INTO client_submissions (assignment_id, client_id, filename, original_name, file_size, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(assignment_id, req.session.user.id, req.file.filename, req.file.originalname, req.file.size, notes || '');

  db.prepare('UPDATE video_assignments SET status = "completed" WHERE id = ?').run(assignment_id);
  res.json({ success: true });
}, (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo supera los 50MB permitidos' });
  res.status(400).json({ error: err.message });
});

// Get my submissions
app.get('/api/client/submissions', requireClient, (req, res) => {
  const submissions = db.prepare(`
    SELECT cs.*, av.title as task_title
    FROM client_submissions cs
    JOIN video_assignments va ON va.id = cs.assignment_id
    JOIN admin_videos av ON av.id = va.admin_video_id
    WHERE cs.client_id = ?
    ORDER BY cs.submitted_at DESC
  `).all(req.session.user.id);
  res.json(submissions);
});

// Error handler for multer
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo supera los 50MB permitidos' });
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`👤 Admin: usuario=admin | contraseña=admin2024\n`);
});
