const express = require('express');
const { sql } = require('../db');
const { isPastCutoff } = require('../utils/time');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiter: max 10 order submissions per IP per 15 minutes
const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many order submissions. Please try again later.' }
});

router.get('/colleagues', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM colleagues ORDER BY name ASC`;
        res.json({ colleagues: rows });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/menu', async (req, res) => {
    try {
        const { rows: menuRows } = await sql`SELECT * FROM menus WHERE status = 'active' ORDER BY id DESC LIMIT 1`;
        const menu = menuRows[0];
        
        const { rows: settingsRows } = await sql`SELECT company_name, office_level, cutoff_time, timezone FROM app_settings WHERE id = 1`;
        const settings = settingsRows[0];
        
        if (!menu) {
            return res.json({ menu: null, config: settings });
        }
        
        const closed = await isPastCutoff();
        
        res.json({
            menu: {
                id: menu.id,
                image_url: menu.image_url,
                menu_date: menu.date,
                set_b_name: menu.set_b_name || 'Set B',
                closed: closed
            },
            config: {
                company_name: settings.company_name,
                cutoff_time: settings.cutoff_time
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/order', orderLimiter, async (req, res) => {
    const { menu_id, guest_name, set_name, quantity, remark, add_meat, add_vege } = req.body;
    
    if (!menu_id || !guest_name || !set_name || !quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate quantity: must be a positive integer between 1 and 10
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
        return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 10' });
    }

    try {
        const { rows: menuRows } = await sql`SELECT * FROM menus WHERE id = ${menu_id} AND status = 'active'`;
        const menu = menuRows[0];
        
        if (!menu) {
            return res.status(400).json({ error: 'Menu is not active or does not exist' });
        }

        const pastCutoff = await isPastCutoff();
        if (pastCutoff) {
            return res.status(400).json({ error: 'Ordering is closed for today' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await sql`
            INSERT INTO orders (menu_id, guest_name, set_name, quantity, remark, submission_ip, add_meat, add_vege)
            VALUES (${menu_id}, ${guest_name.trim()}, ${set_name.trim()}, ${qty}, ${remark ? remark.trim() : null}, ${ip}, ${add_meat ? 1 : 0}, ${add_vege ? 1 : 0})
        `;
        res.json({ message: 'Order submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit order' });
    }
});

module.exports = router;
