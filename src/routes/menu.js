const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { verifyAdmin } = require('../middleware/auth');
const teamsService = require('../services/teams');

const router = express.Router();

// Setup Multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'menu-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
});

// Menu Endpoints
router.get('/active', verifyAdmin, (req, res) => {
    const menu = db.prepare("SELECT * FROM menus WHERE status IN ('active', 'closed', 'draft') ORDER BY id DESC LIMIT 1").get();
    res.json(menu || null);
});

router.post('/upload', verifyAdmin, upload.single('menu_image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    // Save as draft by default
    const result = db.prepare(`
        INSERT INTO menus (menu_date, image_url, status, uploaded_by) 
        VALUES (date('now'), ?, 'draft', ?)
    `).run(imageUrl, req.admin.id);

    res.json({ message: 'Menu uploaded successfully', menuId: result.lastInsertRowid, imageUrl });
});

router.post('/open/:id', verifyAdmin, async (req, res) => {
    const menuId = req.params.id;

    // Close any currently active menus
    db.prepare("UPDATE menus SET status = 'closed' WHERE status = 'active'").run();

    // Open the requested menu
    const result = db.prepare("UPDATE menus SET status = 'active' WHERE id = ?").run(menuId);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Menu not found' });
    }

    // Attempt to send Teams notification
    try {
        await teamsService.sendMenuOpenedNotification();
    } catch (err) {
        console.error('Failed to notify Teams:', err);
    }

    res.json({ message: 'Menu is now open for orders' });
});

router.post('/close/:id', verifyAdmin, async (req, res) => {
    const menuId = req.params.id;

    const result = db.prepare("UPDATE menus SET status = 'closed' WHERE id = ?").run(menuId);
    if (result.changes === 0) {
        return res.status(404).json({ error: 'Menu not found' });
    }

    try {
        await teamsService.sendOrdersClosedNotification();
        const mailer = require('../services/mailer');
        await mailer.sendOrderClosedEmail(process.env.SMTP_USER);
    } catch (err) {
        console.error('Failed to notify Teams or send Email:', err);
    }

    res.json({ message: 'Menu orders are now closed' });
});

module.exports = router;
