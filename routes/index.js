// routes/index.js
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const UPLOAD_FOLDER = path.join(__dirname, '..', 'public', 'uploads');
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// Middleware to verify user token
function requireUserAuth(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const tokenString = token.slice(7);
    try {
        const secretKey = req.app.get('secretKey');
        const payload = jwt.verify(tokenString, secretKey);
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, UPLOAD_FOLDER); },
    filename: (req, file, cb) => {
        const uniqueFilename = uuidv4() + path.extname(file.originalname).toLowerCase();
        cb(null, uniqueFilename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images are allowed.'), false);
        }
    }
}).array('images', 10);

// Main Page Route
router.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EFT Image Uploader</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <style>
        :root {
            --bg-color: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --header-bg: rgba(255, 255, 255, 0.1);
            --card-bg: rgba(255, 255, 255, 0.1);
            --border-color: rgba(255, 255, 255, 0.5);
            --text-color: white;
            --subtext-color: rgba(255, 255, 255, 0.7);
            --input-bg: rgba(255, 255, 255, 0.1);
            --input-border: rgba(255, 255, 255, 0.3);
            --modal-bg: white;
            --modal-text: #333;
        }
        body.dark-mode {
            --bg-color: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            --header-bg: rgba(0, 0, 0, 0.2);
            --card-bg: rgba(0, 0, 0, 0.2);
            --border-color: rgba(255, 255, 255, 0.3);
            --text-color: #e0e0e0;
            --subtext-color: rgba(224, 224, 224, 0.7);
            --input-bg: rgba(0, 0, 0, 0.3);
            --modal-bg: #333;
            --modal-text: #e0e0e0;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; background: var(--bg-color); min-height: 100vh; color: var(--text-color); }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: var(--header-bg); backdrop-filter: blur(10px); border-radius: 15px; padding: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 2.5em; font-weight: bold; display: flex; align-items: center; gap: 10px; }
        .user-controls { display: flex; gap: 10px; align-items: center; }
        .btn { padding: 10px 20px; border: none; border-radius: 25px; cursor: pointer; font-weight: bold; text-decoration: none; color: var(--text-color); }
        .btn-auth { background: var(--header-bg); border: 2px solid var(--border-color); }
        .theme-toggle { background: var(--header-bg); border: 2px solid var(--border-color); border-radius: 50%; width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 1.2em; }
        .upload-section { background: var(--card-bg); backdrop-filter: blur(10px); border-radius: 15px; padding: 30px; text-align: center; }
        .upload-controls { display: flex; flex-direction: row; gap: 20px; align-items: center; }
        .upload-area { border: 3px dashed var(--border-color); border-radius: 15px; padding: 20px; flex-grow: 1; cursor: pointer; min-height: 150px; display: flex; justify-content: center; align-items: center; position: relative; }
        .upload-area.dragover { border-color: #4CAF50; background: rgba(76, 175, 80, 0.1); }
        .upload-area-text { position: absolute; pointer-events: none; }
        .upload-area.has-files .upload-area-text { display: none; }
        .selected-files-container { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
        .selected-file-item { display: flex; flex-direction: column; align-items: center; font-size: 0.8em; max-width: 90px; word-break: break-all; }
        .selected-file-item img { width: 60px; height: 60px; object-fit: cover; border-radius: 5px; margin-bottom: 5px; }
        .btn-upload { background: linear-gradient(45deg, #4CAF50, #45a049); }
        .upload-section.disabled { opacity: 0.5; pointer-events: none; }
        .images-grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 30px; }
        .image-item { background: var(--card-bg); backdrop-filter: blur(10px); border-radius: 15px; padding: 20px; display: flex; gap: 20px; align-items: flex-start; }
        .image-preview { width: 150px; height: 150px; object-fit: cover; border-radius: 10px; }
        .image-links { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .link-item { background: var(--input-bg); padding: 12px; border-radius: 10px; text-align: left; }
        .link-label { font-weight: bold; margin-bottom: 8px; display: block; }
        .link-input-container { display: flex; gap: 8px; align-items: center; }
        .link-input { flex: 1; background: transparent; border: 1px solid var(--input-border); border-radius: 8px; padding: 8px; color: var(--text-color); font-family: 'Courier New', monospace; }
        .btn-copy { background: linear-gradient(45deg, #2196F3, #1976D2); color: white; padding: 8px 15px; }
        .auth-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px); z-index: 1000; }
        .modal-content { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--modal-bg); padding: 30px; border-radius: 15px; min-width: 300px; color: var(--modal-text); }
        .modal-header { text-align: center; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; text-align: left; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input { width: 100%; padding: 10px; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input-bg); color: var(--text-color); }
        .modal-buttons { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
        .btn-login { background: linear-gradient(45deg, #4CAF50, #45a049); }
        .btn-cancel { background: linear-gradient(45deg, #f44336, #d32f2f); }
        .notification { position: fixed; top: 20px; right: 20px; padding: 15px 20px; border-radius: 10px; color: white; font-weight: bold; z-index: 1001; transform: translateX(120%); transition: transform 0.3s ease; }
        .notification.show { transform: translateX(0); }
        .notification.success { background: #4CAF50; }
        .notification.error { background: #f44336; }
		/* Responsive Styles for Mobile */
@media (max-width: 768px) {
    .header, .upload-controls, .image-item {
        flex-direction: column;
        gap: 20px;
    }
    .logo {
        font-size: 1.8em;
        text-align: center;
    }
    .user-controls {
        flex-wrap: wrap;
        justify-content: center;
    }
    .container {
        padding: 10px;
    }
    .image-preview {
        width: 100%;
        max-width: 200px;
        height: auto;
        margin: 0 auto 10px auto;
    }
    .link-input-container {
        flex-direction: column;
    }
    .btn-copy {
        width: 100%;
    }
}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo"><i class="fas fa-cloud-arrow-up"></i> EFT Uploader</div>
            <div class="user-controls">
                <span id="userInfo">Guest</span>
                <button class="btn btn-auth" id="authBtn" onclick="showAuthModal()">Login</button>
                <a href="/admin/dashboard" class="btn btn-auth" id="dashboardLink" style="display: none;">Dashboard</a>
                <button class="btn btn-auth" id="logoutBtn" style="display: none;" onclick="logout()">Logout</button>
                <div class="theme-toggle" onclick="toggleTheme()"><i id="themeIcon"></i></div>
            </div>
        </div>
        
        <div class="upload-section" id="uploadSection">
            <div class="upload-controls">
                <div class="upload-area" id="uploadArea">
                    <div class="upload-area-text">
                        <div id="uploadText" style="font-size: 1.2em;"><i class="fas fa-cloud-upload-alt"></i> Please Login to Upload Images</div>
                        <div style="font-size: 0.9em; color: var(--subtext-color);">Or drag and drop files here</div>
                    </div>
                    <div class="selected-files-container" id="selectedFilesContainer"></div>
                </div>
                <input type="file" id="fileInput" multiple accept="image/*" style="display:none;">
                <button class="btn btn-upload" onclick="uploadImages()">Upload</button>
            </div>
        </div>

        <div class="images-grid" id="imagesGrid"></div>
    </div>

    <div class="auth-modal" id="authModal" style="display:none;">
        <div class="modal-content">
            <div class="modal-header"><h2>Login</h2></div>
            <div class="form-group"><label>Username:</label><input type="text" id="username" placeholder="Enter username"></div>
            <div class="form-group"><label>Password:</label><input type="password" id="password" placeholder="Enter password"></div>
            <div class="modal-buttons">
                <button class="btn btn-login" onclick="login()">Login</button>
                <button class="btn btn-cancel" onclick="hideAuthModal()">Cancel</button>
            </div>
        </div>
    </div>

    <div id="notification" class="notification"></div>
    
    <script>
        let currentUser = null;
        let selectedFiles = [];

        document.addEventListener('DOMContentLoaded', () => {
            initializeTheme();
            checkLoginStatus();
            setupUploadArea();
        });

        function setupUploadArea() {
            const uploadArea = document.getElementById('uploadArea');
            const fileInput = document.getElementById('fileInput');
            uploadArea.addEventListener('click', () => fileInput.click());
            uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
            uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                handleFiles(e.dataTransfer.files);
            });
            fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        }

        function handleFiles(files) {
            selectedFiles = Array.from(files);
            const container = document.getElementById('selectedFilesContainer');
            container.innerHTML = '';
            document.getElementById('uploadArea').classList.toggle('has-files', selectedFiles.length > 0);

            selectedFiles.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = e => {
                        const item = document.createElement('div');
                        item.className = 'selected-file-item';
                        item.innerHTML = \`<img src="\${e.target.result}" alt="preview"><span>\${file.name}</span>\`;
                        container.appendChild(item);
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        function initializeTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            document.body.classList.toggle('dark-mode', savedTheme === 'dark');
            document.getElementById('themeIcon').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }

        function toggleTheme() {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
            initializeTheme();
        }

        function updateUI() {
            const userInfo = document.getElementById('userInfo');
            const authBtn = document.getElementById('authBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            const dashboardLink = document.getElementById('dashboardLink');
            const uploadSection = document.getElementById('uploadSection');
            const uploadText = document.getElementById('uploadText');

            userInfo.style.display = 'inline-block';
            if (currentUser) {
                userInfo.textContent = \`Hello, \${currentUser.username} (\${currentUser.role})\`;
                authBtn.style.display = 'none';
                logoutBtn.style.display = 'inline-block';
                dashboardLink.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
                uploadSection.classList.remove('disabled');
                uploadText.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Ready to Upload';
            } else {
                userInfo.textContent = 'Guest';
                authBtn.style.display = 'inline-block';
                logoutBtn.style.display = 'none';
                dashboardLink.style.display = 'none';
                uploadSection.classList.add('disabled');
                uploadText.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Please Login to Upload Images';
            }
        }
        
        function checkLoginStatus() {
            const token = localStorage.getItem('userToken');
            if (!token) {
                currentUser = null;
                updateUI();
                return;
            }
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp * 1000 < Date.now()) return logout();
                currentUser = { username: payload.username, role: payload.role, userId: payload.user_id };
                updateUI();
            } catch (e) {
                logout();
            }
        }

        function showAuthModal() {
            document.getElementById('authModal').style.display = 'block';
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        }

        function hideAuthModal() {
            document.getElementById('authModal').style.display = 'none';
        }

        async function login() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            try {
                const response = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.error);
                localStorage.setItem('userToken', data.token);
                checkLoginStatus();
                hideAuthModal();
                showNotification('Login successful!', 'success');
            } catch(error) {
                showNotification(error.message || 'Login failed', 'error');
            }
        }
        
        function logout() {
            localStorage.removeItem('userToken');
            currentUser = null;
            updateUI();
            document.getElementById('imagesGrid').innerHTML = ''; // Clear uploaded images from view
            showNotification('Logged out successfully', 'success');
        }

        async function uploadImages() {
            if (!currentUser) return showNotification('Please login to upload.', 'error');
            if (selectedFiles.length === 0) return showNotification('Please select files to upload.', 'error');
            const formData = new FormData();
            selectedFiles.forEach(file => formData.append('images', file));

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    headers: { 'Authorization': \`Bearer \${localStorage.getItem('userToken')}\` },
                    body: formData
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.error);
                
                showNotification(\`\${data.images.length} image(s) uploaded!\`, 'success');
                displayImages(data.images);
                
                selectedFiles = [];
                document.getElementById('fileInput').value = '';
                document.getElementById('selectedFilesContainer').innerHTML = '';
                document.getElementById('uploadArea').classList.remove('has-files');

            } catch(error) {
                showNotification(error.message, 'error');
            }
        }
        
        function displayImages(images) {
            const grid = document.getElementById('imagesGrid');
            images.forEach(image => {
                const directLink = \`\${window.location.origin}/uploads/\${image.filename}\`;
                const bbCode = \`[IMG]\${directLink}[/IMG]\`;
                const item = document.createElement('div');
                item.className = 'image-item';
                item.innerHTML = \`
                    <img src="\${directLink}" alt="Uploaded image" class="image-preview">
                    <div class="image-links">
                        <div class="link-item">
                            <label class="link-label">Direct Link</label>
                            <div class="link-input-container">
                                <input type="text" class="link-input" value="\${directLink}" readonly>
                                <button class="btn btn-copy" onclick="copyToClipboard('\${directLink}')">Copy</button>
                            </div>
                        </div>
                        <div class="link-item">
                            <label class="link-label">BBCode</label>
                            <div class="link-input-container">
                                <input type="text" class="link-input" value="\${bbCode}" readonly>
                                <button class="btn btn-copy" onclick="copyToClipboard('\${bbCode}')">Copy</button>
                            </div>
                        </div>
                    </div>
                \`;
                grid.prepend(item);
            });
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('Link copied!', 'success');
            }).catch(() => {
                showNotification('Failed to copy.', 'error');
            });
        }

        function showNotification(message, type) {
            const el = document.getElementById('notification');
            el.className = \`notification show \${type}\`;
            el.textContent = message;
            setTimeout(() => { el.classList.remove('show'); }, 3000);
        }
    </script>
</body>
</html>`);
});

router.post('/upload', requireUserAuth, (req, res) => {
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No images provided' });
        
        const db = getDb();
        const uploadedImages = [];
        const stmt = db.prepare('INSERT INTO images (filename, original_name, file_size, upload_date, ip_address, user_id) VALUES (?, ?, ?, ?, ?, ?)');
        
        req.files.forEach(file => {
            stmt.run(file.filename, file.originalname, file.size, new Date().toISOString(), req.ip, req.user.user_id);
            uploadedImages.push({ filename: file.filename });
        });

        stmt.finalize((err) => {
            db.close();
            if (err) return res.status(500).json({ success: false, error: 'DB Error: ' + err.message });
            res.json({ success: true, images: uploadedImages });
        });
    });
});

router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password required' });
    }
    const db = getDb();
    const sql = `SELECT id, username, password_hash, role FROM users WHERE username = ? UNION ALL SELECT id, username, password_hash, 'admin' as role FROM admins WHERE username = ?`;
    db.get(sql, [username, username], async (err, user) => {
        if (err) { db.close(); return res.status(500).json({ success: false, error: err.message }); }
        if (!user) { db.close(); return res.status(401).json({ success: false, error: 'Invalid credentials' }); }

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            const secretKey = req.app.get('secretKey');
            const token = jwt.sign(
                { user_id: user.id, username: user.username, role: user.role },
                secretKey,
                { expiresIn: '1h' }
            );
            db.close();
            return res.json({ success: true, token, username: user.username, role: user.role, user_id: user.id });
        } else {
            db.close();
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    });
});

module.exports = router;
