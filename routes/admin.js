// routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// --- Setup Folders ---
const BACKUP_FOLDER = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_FOLDER)) {
    fs.mkdirSync(BACKUP_FOLDER);
}
const UPLOAD_FOLDER = path.join(__dirname, '..', 'public', 'uploads');
const ADMIN_DASHBOARD_PATH = path.join(__dirname, '..', 'public', 'dashboard.html');

// --- Middleware to verify admin token ---
function requireAdminToken(req, res, next) {
    let tokenString = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        tokenString = req.headers.authorization.slice(7);
    } else if (req.query.token) {
        tokenString = req.query.token;
    }
    if (!tokenString) return res.status(401).json({ success: false, error: 'Authentication required' });

    try {
        const secretKey = req.app.get('secretKey');
        const payload = jwt.verify(tokenString, secretKey);
        if (payload.role !== 'admin') return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// --- General Admin Routes ---
router.get('/dashboard', (req, res) => res.sendFile(ADMIN_DASHBOARD_PATH));
router.get('/api/verify_admin', requireAdminToken, (req, res) => res.json({ success: true }));

// --- API for Images & Main Stats (Manage Images Tab) ---
router.get('/api/dashboard', requireAdminToken, (req, res) => {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const statsPromise = new Promise((resolve, reject) => {
        db.get(`SELECT
            (SELECT COUNT(*) FROM images) as total_images,
            (SELECT SUM(file_size) FROM images) as total_size,
            (SELECT COUNT(DISTINCT ip_address) FROM images) as unique_ips
        `, (err, row) => err ? reject(err) : resolve(row));
    });

    const imagesPromise = new Promise((resolve, reject) => {
        const sql = `
            SELECT i.id, i.filename, i.original_name, i.file_size, i.upload_date, i.ip_address,
                   COALESCE(u.username, a.username || ' (Admin)', 'Guest') AS username
            FROM images AS i
            LEFT JOIN users AS u ON i.user_id = u.id
            LEFT JOIN admins AS a ON i.user_id = a.id
            ORDER BY i.upload_date DESC LIMIT ? OFFSET ?`;
        db.all(sql, [limit, offset], (err, rows) => err ? reject(err) : resolve(rows));
    });

    Promise.all([statsPromise, imagesPromise])
        .then(([stats, images]) => {
            res.json({ success: true, stats: { ...stats, total_size: stats.total_size || 0 }, images });
        })
        .catch(error => res.status(500).json({ success: false, error: 'Failed to fetch dashboard data: ' + error.message }))
        .finally(() => db.close());
});

router.post('/api/delete_image', requireAdminToken, (req, res) => {
    const { filename, id } = req.body;
    if (!filename || !id) return res.status(400).json({ success: false, error: 'Filename and ID required' });
    const db = getDb();
    db.run('DELETE FROM images WHERE id = ?', [id], function(err) {
        db.close();
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (this.changes > 0) {
            fs.unlink(path.join(UPLOAD_FOLDER, filename), (unlinkErr) => {
                if (unlinkErr) console.error(`Failed to delete file: ${filename}`, unlinkErr);
            });
        }
        res.json({ success: true, message: 'Image deleted successfully' });
    });
});

// --- API for User Management (Manage Users Tab) ---
router.get('/api/users', requireAdminToken, (req, res) => {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const totalPromise = new Promise((resolve, reject) => {
        db.get("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM admins) as count", (err, row) => err ? reject(err) : resolve(row.count));
    });
    const usersPromise = new Promise((resolve, reject) => {
        const sql = `SELECT id, username, 'user' as role FROM users UNION ALL SELECT id, username, 'admin' as role FROM admins ORDER BY username LIMIT ? OFFSET ?`;
        db.all(sql, [limit, offset], (err, rows) => err ? reject(err) : resolve(rows));
    });

    Promise.all([totalPromise, usersPromise])
        .then(([total_users, users]) => res.json({ success: true, stats: { total_users }, users }))
        .catch(error => res.status(500).json({ success: false, error: 'Failed to fetch users: ' + error.message }))
        .finally(() => db.close());
});

router.post('/api/add_user', requireAdminToken, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.status(400).json({ success: false, error: 'Username, password, and role are required' });
    const db = getDb();
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) { db.close(); return res.status(500).json({ success: false, error: 'Error hashing password' }); }
        
        const table = role === 'admin' ? 'admins' : 'users';
        const columns = role === 'admin' ? '(username, password_hash)' : '(username, password_hash, role)';
        const params = role === 'admin' ? [username, hash] : [username, hash, 'user'];
        
        db.run(`INSERT INTO ${table} ${columns} VALUES (${params.map(() => '?').join(',')})`, params, function(err) {
            db.close();
            if (err) return res.status(409).json({ success: false, error: 'Username already exists.' });
            res.json({ success: true, message: `User '${username}' added successfully.` });
        });
    });
});

// routes/admin.js

router.post('/api/edit_user', requireAdminToken, (req, res) => {
    const { id, username, password, role } = req.body;
    if (!id || !username || !role || !['user', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, error: 'User ID, username, and a valid role are required' });
    }

    const db = getDb();
    const run = (sql, params) => new Promise((resolve, reject) => db.run(sql, params, function(err) { (err) ? reject(err) : resolve(this) }));
    const get = (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err) ? reject(err) : resolve(row)));

    (async () => {
        try {
            // 1. تحقق من أن اسم المستخدم الجديد غير مستخدم من قبل شخص آخر
            const existingUser = await get(`SELECT id FROM users WHERE username = ? AND id != ? UNION ALL SELECT id FROM admins WHERE username = ? AND id != ?`, [username, id, username, id]);
            if (existingUser) {
                return res.status(409).json({ success: false, error: 'Username already exists.' });
            }

            // 2. ابحث عن المستخدم الحالي لمعرفة جدوله ودوره الحالي
            let userRecord = await get(`SELECT id, username, password_hash, 'user' as currentRole FROM users WHERE id = ?`, [id]);
            if (!userRecord) {
                userRecord = await get(`SELECT id, username, password_hash, 'admin' as currentRole FROM admins WHERE id = ?`, [id]);
            }
            if (!userRecord) {
                return res.status(404).json({ success: false, error: 'User not found.' });
            }

            // 3. جهز كلمة المرور الجديدة إذا تم توفيرها
            let newPasswordHash = userRecord.password_hash;
            if (password) {
                newPasswordHash = await bcrypt.hash(password, 10);
            }
            
            const currentTable = userRecord.currentRole === 'admin' ? 'admins' : 'users';
            const targetTable = role === 'admin' ? 'admins' : 'users';

            // 4. قم بعملية التحديث
            if (currentTable === targetTable) {
                // لم يتغير الدور، فقط قم بتحديث البيانات في الجدول الحالي
                const params = role === 'admin'
                    ? [username, newPasswordHash, id]
                    : [username, newPasswordHash, role, id];
                const updateSql = role === 'admin'
                    ? `UPDATE admins SET username = ?, password_hash = ? WHERE id = ?`
                    : `UPDATE users SET username = ?, password_hash = ?, role = ? WHERE id = ?`;
                await run(updateSql, params);
            } else {
                // تغير الدور، لذا احذف من الجدول القديم وأضف في الجديد
                await run(`DELETE FROM ${currentTable} WHERE id = ?`, [id]);
                
                const params = role === 'admin'
                    ? [id, username, newPasswordHash]
                    : [id, username, newPasswordHash, 'user'];
                const insertSql = role === 'admin'
                    ? `INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)`
                    : `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)`;
                await run(insertSql, params);
            }

            res.json({ success: true, message: `User '${username}' updated successfully.` });

        } catch (error) {
            console.error('Error editing user:', error);
            res.status(500).json({ success: false, error: 'Failed to edit user.' });
        } finally {
            db.close();
        }
    })();
});

router.post('/api/delete_user', requireAdminToken, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'User ID is required' });
    if (Number(id) === req.user.user_id) return res.status(403).json({ success: false, error: "You cannot delete your own account." });
    
    const db = getDb();
    // Try deleting from users table first, then admins table
    db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
        if (err) { db.close(); return res.status(500).json({ success: false, error: err.message }); }
        if (this.changes > 0) {
            db.close();
            return res.json({ success: true, message: 'User deleted successfully.' });
        }
        // If not found in users, try admins
        db.run(`DELETE FROM admins WHERE id = ?`, [id], function(err) {
            db.close();
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'User not found.' });
            res.json({ success: true, message: 'Admin user deleted successfully.' });
        });
    });
});

// --- API for Backups (Manage Backups Tab) ---
router.post('/api/create_backup', requireAdminToken, (req, res) => {
    const date = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const fileName = `backup-${date}.zip`;
    const filePath = path.join(BACKUP_FOLDER, fileName);
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => res.json({ success: true, message: `Backup '${fileName}' created.` }));
    archive.on('error', (err) => res.status(500).json({ success: false, error: err.message }));
    archive.pipe(output);
    archive.file(path.join(__dirname, '..', 'database.db'), { name: 'database.db' });
    archive.directory(UPLOAD_FOLDER, 'uploads');
    archive.finalize();
});

router.get('/api/list_backups', requireAdminToken, (req, res) => {
    fs.readdir(BACKUP_FOLDER, (err, files) => {
        if (err) return res.status(500).json({ success: false, error: 'Could not list backups.' });
        const backups = files.filter(f => f.endsWith('.zip')).map(file => {
            const stats = fs.statSync(path.join(BACKUP_FOLDER, file));
            return { filename: file, size: stats.size, date: stats.mtime.toISOString() };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json({ success: true, backups });
    });
});

router.get('/api/download_backup', requireAdminToken, (req, res) => {
    const { filename } = req.query;
    if (!filename || filename.includes('..')) return res.status(400).json({ error: 'Invalid filename.' });
    const filePath = path.join(BACKUP_FOLDER, filename);
    if (fs.existsSync(filePath)) res.download(filePath);
    else res.status(404).json({ error: 'Backup not found.' });
});

router.post('/api/delete_backup', requireAdminToken, (req, res) => {
    const { filename } = req.body;
    if (!filename || filename.includes('..')) return res.status(400).json({ success: false, error: 'Invalid filename.' });
    const filePath = path.join(BACKUP_FOLDER, filename);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) return res.status(500).json({ success: false, error: 'Could not delete backup.' });
            res.json({ success: true, message: 'Backup deleted.' });
        });
    } else {
        res.status(404).json({ success: false, error: 'Backup not found.' });
    }
});

module.exports = router;