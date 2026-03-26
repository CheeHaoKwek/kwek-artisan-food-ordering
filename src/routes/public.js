const express = require('express');
const { sql } = require('../db');

const router = express.Router();

async function isPastCutoff() {
    try {
        const { rows } = await sql`SELECT cutoff_time, timezone FROM app_settings WHERE id = 1`;
        const settings = rows[0];
        if (!settings || !settings.cutoff_time) return false;
        
        const now = new Date();
        const [cutoffHour, cutoffMin] = settings.cutoff_time.split(':').map(Number);
        
        const options = { timeZone: settings.timezone, hour12: false, hour: '2-digit', minute: '2-digit' };
        const tzTimeStr = new Intl.DateTimeFormat('en-GB', options).format(now);
        const [tzHour, tzMin] = tzTimeStr.split(':').map(Number);
        
        const nowMins = tzHour * 60 + tzMin;
        const cutoffMins = cutoffHour * 60 + cutoffMin;
        
        return nowMins >= cutoffMins;
    } catch (e) { return false; }
}

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

router.post('/order', async (req, res) => {
    const { menu_id, guest_name, set_name, quantity, remark, add_meat, add_vege } = req.body;
    
    if (!menu_id || !guest_name || !set_name || !quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
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
            VALUES (${menu_id}, ${guest_name.trim()}, ${set_name.trim()}, ${Number(quantity)}, ${remark ? remark.trim() : null}, ${ip}, ${add_meat ? 1 : 0}, ${add_vege ? 1 : 0})
        `;
        res.json({ message: 'Order submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit order' });
    }
});

module.exports = router;
