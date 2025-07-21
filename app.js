// app.js
const express = require('express');
const path = require('path');
const { initDb } = require('./db'); // استيراد دالة إعداد قاعدة البيانات
const indexRoutes = require('./routes/index'); // استيراد مسارات الواجهة الأمامية
const adminRoutes = require('./routes/admin'); // استيراد مسارات المسؤول

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
    console.error('FATAL ERROR: SECRET_KEY is not defined.');
    process.exit(1);
}

// إعداد المفتاح السري كمتغير على مستوى التطبيق
app.set('secretKey', SECRET_KEY);

// تهيئة قاعدة البيانات عند بدء التطبيق
const db = initDb();
app.set('db', db); // لجعل كائن DB متاحًا في المسارات

// Middlewares
app.use(express.json()); // لتمكين تحليل طلبات JSON
app.use(express.urlencoded({ extended: true })); // لتمكين تحليل طلبات URL-encoded

// خدمة الملفات الثابتة (مثل الصور المحملة والواجهة الأمامية)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// استخدام المسارات
app.use('/', indexRoutes); // مسارات الصفحة الرئيسية وتحميل الصور
app.use('/admin', adminRoutes); // مسارات لوحة تحكم المسؤول وواجهة برمجة التطبيقات

// معالجة الأخطاء (مثل File Too Large) - يجب أن تكون بعد مسارات Multer
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'File too large (max 2MB)' });
    }
    next(err); // تمرير الخطأ إلى معالج الأخطاء الافتراضي
});


// بدء الخادم
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});