const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'platform.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS admin_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS video_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_video_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (admin_video_id) REFERENCES admin_videos(id),
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id),
    UNIQUE(admin_video_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS client_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (assignment_id) REFERENCES video_assignments(id),
    FOREIGN KEY (client_id) REFERENCES users(id)
  );
`);

// Seed admin user if not exists
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin2024', 10);
  db.prepare(`
    INSERT INTO users (name, phone, username, password, role)
    VALUES (?, ?, ?, ?, ?)
  `).run('Administrador', '0000000000', 'admin', hashedPassword, 'admin');
  console.log('✅ Admin user created: username=admin, password=admin2024');
}

module.exports = db;
