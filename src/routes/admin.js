const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyAdmin, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// --- Auth Routes ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '12h' });
    
    res.cookie('admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
    });

    res.json({ message: 'Logged in successfully', username: admin.username });
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ message: 'Logged out successfully' });
});

router.get('/check', verifyAdmin, (req, res) => {
    res.json({ loggedIn: true, username: req.admin.username });
});

// --- App Settings Routes ---
router.get('/settings', verifyAdmin, (req, res) => {
    const settings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
    res.json(settings);
});

router.post('/settings', verifyAdmin, (req, res) => {
    const { company_name, office_level, teams_webhook_url, reminder_time, cutoff_time, timezone, vendor_message_template } = req.body;
    
    try {
        db.prepare(`
            UPDATE app_settings 
            SET company_name = ?, office_level = ?, teams_webhook_url = ?, 
                reminder_time = ?, cutoff_time = ?, timezone = ?, vendor_message_template = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `).run(company_name, office_level, teams_webhook_url, reminder_time, cutoff_time, timezone, vendor_message_template);
        
        // Safely try to re-init scheduler if it exists
        try {
            const scheduler = require('../services/scheduler');
            if (scheduler && scheduler.init) scheduler.init();
        } catch (e) {
            console.log('Scheduler not initialized yet');
        }
        
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// --- Dashboard Orders & Summary ---
router.get('/orders', verifyAdmin, (req, res) => {
    // Get active menu
    const menu = db.prepare("SELECT * FROM menus WHERE status IN ('active', 'closed') ORDER BY id DESC LIMIT 1").get();
    if (!menu) return res.json({ orders: [] });

    const orders = db.prepare('SELECT * FROM orders WHERE menu_id = ? ORDER BY created_at DESC').all(menu.id);
    res.json({ orders, menuStatus: menu.status });
});

router.get('/summary', verifyAdmin, (req, res) => {
    const menu = db.prepare("SELECT * FROM menus WHERE status IN ('active', 'closed') ORDER BY id DESC LIMIT 1").get();
    if (!menu) return res.json({ summary: null });

    const orders = db.prepare('SELECT * FROM orders WHERE menu_id = ?').all(menu.id);
    
    // Aggregate by person
    const personGroups = {};
    const setGroups = {};
    let totalItems = 0;
    let totalPrice = 0;

    orders.forEach(order => {
        // Person group
        if (!personGroups[order.guest_name]) {
            personGroups[order.guest_name] = [];
        }
        personGroups[order.guest_name].push({ set: order.set_name, qty: order.quantity });

        // Set group
        if (!setGroups[order.set_name]) setGroups[order.set_name] = 0;
        setGroups[order.set_name] += order.quantity;
        
        totalItems += order.quantity;

        // Pricing logic
        let basePrice = 9.90;
        if (order.add_meat === 1) basePrice += 4.50;
        if (order.add_vege === 1) basePrice += 2.00;
        totalPrice += (basePrice * order.quantity);
    });

    const formattedPersonLines = [];
    for (const [name, items] of Object.entries(personGroups)) {
        // Aggregate same items for a person just in case they added multiple rows
        const itemCounts = {};
        items.forEach(i => {
            if (!itemCounts[i.set]) itemCounts[i.set] = 0;
            itemCounts[i.set] += i.qty;
        });

        const itemsStr = Object.entries(itemCounts).map(([set, qty]) => `${set} x(${qty})`).join(' ');
        formattedPersonLines.push(`${name} - ${itemsStr}`);
    }

    res.json({
        totalOrders: orders.length,
        totalItems,
        totalPrice: totalPrice.toFixed(2),
        setGroups,
        personLines: formattedPersonLines,
        menuId: menu.id,
        menuStatus: menu.status
    });
});

router.get('/vendor-message', verifyAdmin, (req, res) => {
    const settings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
    const menu = db.prepare("SELECT * FROM menus WHERE status IN ('active', 'closed') ORDER BY id DESC LIMIT 1").get();
    
    if (!menu) return res.status(400).json({ error: 'No active or closed menu available' });

    const orders = db.prepare('SELECT * FROM orders WHERE menu_id = ?').all(menu.id);
    
    const allItemsCounts = {};
    const allRemarks = [];

    orders.forEach(o => {
        if (!allItemsCounts[o.set_name]) allItemsCounts[o.set_name] = 0;
        allItemsCounts[o.set_name] += o.quantity;

        let addons = [];
        if (o.add_meat === 1) addons.push('Add Meat');
        if (o.add_vege === 1) addons.push('Add Tofu/Egg/Vege');
        
        let remarkText = '';
        if (addons.length > 0) remarkText += addons.join(', ');
        if (o.remark && o.remark.trim() !== '') {
            remarkText += (remarkText ? ', ' : '') + o.remark.trim();
        }
        
        if (remarkText) {
            allRemarks.push(`${o.quantity} ${o.set_name} ${remarkText}`);
        }
    });

    const itemsStr = Object.entries(allItemsCounts).map(([set, qty]) => `${set} x${qty}`).join(' ');

    const orderLines = [];
    orderLines.push(`Kwek - ${itemsStr}`);
    allRemarks.forEach(r => orderLines.push(r));

    // Format DAY and DATE based on the NEXT day (tomorrow)
    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + 1);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[dateObj.getDay()];
    // format DD/MM/YYYY
    const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

    let message = settings.vendor_message_template;
    message = message.replace(/{LEVEL}/g, settings.office_level || '');
    message = message.replace(/{COMPANY_NAME}/g, settings.company_name || '');
    message = message.replace(/{ORDER_LINES}/g, orderLines.join('\\n'));
    message = message.replace(/DAY/g, dayName);
    message = message.replace(/DATE/g, formattedDate);

    // Unescape literal newlines in the string
    message = message.replace(/\\n/g, '\n');

    res.json({ message });
});

module.exports = router;
