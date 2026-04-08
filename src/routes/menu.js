const express = require('express');
const multer = require('multer');
const path = require('path');
const { sql } = require('../db');
const { verifyAdmin } = require('../middleware/auth');
const teamsService = require('../services/teams');
const mailer = require('../services/mailer');
const { put } = require('@vercel/blob');

const router = express.Router();

// Setup Multer for memory storage (for Vercel compatibility)
const upload = multer({
    storage: multer.memoryStorage(),
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
router.get('/active', verifyAdmin, async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM menus WHERE status IN ('active', 'closed', 'draft') ORDER BY id DESC LIMIT 1`;
        res.json(rows[0] || null);
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/upload', verifyAdmin, upload.single('menu_image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }

    try {
        // Upload to Vercel Blob
        const blobOptions = {
            access: 'public',
            addRandomSuffix: true
        };
        const blob = await put(`menu-${Date.now()}${path.extname(req.file.originalname)}`, req.file.buffer, blobOptions);

        const imageUrl = blob.url;
        
        // Save as draft by default
        const result = await sql`
            INSERT INTO menus (date, image_url, status) 
            VALUES (CURRENT_DATE::VARCHAR, ${imageUrl}, 'draft')
            RETURNING id
        `;

        res.json({ message: 'Menu uploaded successfully', menuId: result.rows[0].id, imageUrl });
    } catch (err) {
        console.error('Error uploading menu:', err);
        res.status(500).json({ error: 'Failed to upload menu' });
    }
});

router.post('/open/:id', verifyAdmin, async (req, res) => {
    const menuId = req.params.id;
    const { setBName } = req.body;

    try {
        // Close any currently active menus
        await sql`UPDATE menus SET status = 'closed' WHERE status = 'active'`;

        // Open the requested menu and set the chosen Set B/C name
        const result = await sql`UPDATE menus SET status = 'active', set_b_name = ${setBName || 'Set B'} WHERE id = ${menuId}`;
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Menu not found' });
        }

        // --- NEW: Data Cleanup ---
        // Delete all orders that do not belong to the current menu
        await sql`DELETE FROM orders WHERE menu_id != ${menuId}`;
        // Delete all menus except the current one
        await sql`DELETE FROM menus WHERE id != ${menuId}`;

        // Attempt to send Teams notification
        try {
            await teamsService.sendMenuOpenedNotification();
        } catch (err) {
            console.error('Failed to notify Teams:', err);
        }

        res.json({ message: 'Menu is now open for orders' });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/close/:id', verifyAdmin, async (req, res) => {
    const menuId = req.params.id;

    try {
        const result = await sql`UPDATE menus SET status = 'closed' WHERE id = ${menuId}`;
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Menu not found' });
        }

        try {
            await mailer.sendOrderClosedEmail(process.env.SMTP_USER);
        } catch (err) {
            console.error('Failed to send closed email:', err);
        }

        res.json({ message: 'Menu orders are now closed' });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
