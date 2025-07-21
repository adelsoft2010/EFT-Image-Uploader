// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt'); // لاستخدام bcrypt لتجزئة كلمة المرور
const fs = require('fs'); // للتأكد من وجود مجلد الرفع

const DB_PATH = path.join(__dirname, 'database.db');
const UPLOAD_FOLDER = path.join(__dirname, 'public', 'uploads'); // مسار مجلد الرفع

// قم بإنشاء مجلد التحميل إذا لم يكن موجودًا
if (!fs.existsSync(UPLOAD_FOLDER)) { // استخدام fs.existsSync بدلاً من require('fs').existsSync
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true }); // استخدام fs.mkdirSync بدلاً من require('fs').mkdirSync
}

function initDb() {
    const db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('Error connecting to database:', err.message);
        } else {
            console.log('Connected to the SQLite database.');

            // جدول الصور (بدون تغيير)
            db.run(`
                CREATE TABLE IF NOT EXISTS images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    upload_date DATETIME NOT NULL,
                    ip_address TEXT,
                    user_id INTEGER, -- إضافة عمود لربط الصورة بالمستخدم الذي قام برفعها
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating images table:', err.message);
                } else {
                    console.log('Images table ensured.');
                }
            });

            // جدول المشرفين (بدون تغيير)
            db.run(`
                CREATE TABLE IF NOT EXISTS admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating admins table:', err.message);
                } else {
                    console.log('Admins table ensured.');
                    const defaultAdminUsername = 'admin';
                    const defaultAdminPassword = 'admin123';
                    bcrypt.hash(defaultAdminPassword, 10, (err, hash) => {
                        if (err) {
                            console.error('Error hashing default admin password:', err.message);
                            return;
                        }
                        db.run(`
                            INSERT OR IGNORE INTO admins (username, password_hash)
                            VALUES (?, ?)
                        `, [defaultAdminUsername, hash], function(err) {
                            if (err) {
                                console.error('Error inserting default admin:', err.message);
                            } else if (this.changes > 0) {
                                console.log('Default admin (admin/admin123) created.');
                            } else {
                                console.log('Default admin already exists.');
                            }
                        });
                    });
                }
            });

            // جدول المستخدمين العاديين
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user' NOT NULL -- إضافة عمود الدور (user/admin)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating users table:', err.message);
                } else {
                    console.log('Users table ensured.');
                    // يمكن إضافة مستخدم افتراضي هنا أيضًا إذا لزم الأمر
                    const defaultUserUsername = 'user';
                    const defaultUserPassword = 'user123';
                    bcrypt.hash(defaultUserPassword, 10, (err, hash) => {
                        if (err) {
                            console.error('Error hashing default user password:', err.message);
                            return;
                        }
                        db.run(`
                            INSERT OR IGNORE INTO users (username, password_hash, role)
                            VALUES (?, ?, ?)
                        `, [defaultUserUsername, hash, 'user'], function(err) {
                            if (err) {
                                console.error('Error inserting default user:', err.message);
                            } else if (this.changes > 0) {
                                console.log('Default user (user/user123) created.');
                            } else {
                                console.log('Default user already exists.');
                            }
                        });
                    });
                }
            });
        }
    });
    return db;
}

// دالة للحصول على كائن قاعدة البيانات (لإعادة الاستخدام)
function getDb() {
    return new sqlite3.Database(DB_PATH);
}

module.exports = {
    initDb,
    getDb
};