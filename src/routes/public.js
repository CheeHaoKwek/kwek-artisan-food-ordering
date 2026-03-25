const express = require('express');
const db = require('../db');

const router = express.Router();

// Helper to check if past cutoff
function isPastCutoff() {
    const settings = db.prepare('SELECT cutoff_time, timezone FROM app_settings WHERE id = 1').get();
    if (!settings || !settings.cutoff_time) return false;
    
    // Get current time in specified timezone
    const now = new Date();
    
    // Parsing cutoff_time 'HH:MM'
    const [cutoffHour, cutoffMin] = settings.cutoff_time.split(':').map(Number);
    
    // Create cutoff date object internally to compare using Intl API
    const options = { timeZone: settings.timezone, hour12: false, hour: '2-digit', minute: '2-digit' };
    const tzTimeStr = new Intl.DateTimeFormat('en-GB', options).format(now);
    const [tzHour, tzMin] = tzTimeStr.split(':').map(Number);
    
    const nowMins = tzHour * 60 + tzMin;
    const cutoffMins = cutoffHour * 60 + cutoffMin;
    
    return nowMins >= cutoffMins;
}

router.get('/menu', (req, res) => {
    const menu = db.prepare("SELECT * FROM menus WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    const settings = db.prepare('SELECT company_name, office_level, cutoff_time, timezone FROM app_settings WHERE id = 1').get();
    
    if (!menu) {
        return res.json({ menu: null, config: settings });
    }
    
    const closed = isPastCutoff();
    
    res.json({
        menu: {
            id: menu.id,
            image_url: menu.image_url,
            menu_date: menu.menu_date,
            closed: closed
        },
        config: {
            company_name: settings.company_name,
            cutoff_time: settings.cutoff_time
        }
    });
});

router.post('/order', (req, res) => {
    const { menu_id, guest_name, set_name, quantity, remark, add_meat, add_vege } = req.body;
    
    if (!menu_id || !guest_name || !set_name || !quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const menu = db.prepare("SELECT * FROM menus WHERE id = ? AND status = 'active'").get(menu_id);
    if (!menu) {
        return res.status(400).json({ error: 'Menu is not active or does not exist' });
    }

    if (isPastCutoff()) {
        return res.status(400).json({ error: 'Ordering is closed for today' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        db.prepare(`
            INSERT INTO orders (menu_id, guest_name, set_name, quantity, remark, submission_ip, add_meat, add_vege)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(menu_id, guest_name.trim(), set_name.trim(), Number(quantity), remark ? remark.trim() : null, ip, add_meat ? 1 : 0, add_vege ? 1 : 0);
        res.json({ message: 'Order submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit order' });
    }
});

module.exports = router;
