const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql } = require('../db');
const { verifyAdmin, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// --- Shared Helper ---
async function getActiveMenu() {
    const { rows } = await sql`SELECT * FROM menus WHERE status IN ('active', 'closed') ORDER BY id DESC LIMIT 1`;
    return rows[0] || null;
}

// --- Auth Routes ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const { rows } = await sql`SELECT * FROM users WHERE username = ${username}`;
        const admin = rows[0];
        
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
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
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ message: 'Logged out successfully' });
});

router.get('/check', verifyAdmin, (req, res) => {
    res.json({ loggedIn: true, username: req.admin.username });
});

// --- App Settings Routes ---
router.get('/settings', verifyAdmin, async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM app_settings WHERE id = 1`;
        res.json(rows[0] || {});
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/settings', verifyAdmin, async (req, res) => {
    const { company_name, office_level, coordinator_name, teams_webhook_url, reminder_time, cutoff_time, timezone, vendor_message_template } = req.body;

    // --- Input Validation ---
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!company_name || !office_level || !coordinator_name || !reminder_time || !cutoff_time || !timezone || !vendor_message_template) {
        return res.status(400).json({ error: 'All settings fields are required' });
    }
    if (!timeRegex.test(reminder_time) || !timeRegex.test(cutoff_time)) {
        return res.status(400).json({ error: 'reminder_time and cutoff_time must be in HH:MM format' });
    }
    try {
        // Validate timezone
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
        return res.status(400).json({ error: 'Invalid timezone identifier' });
    }

    try {
        await sql`
            UPDATE app_settings 
            SET company_name = ${company_name},
                office_level = ${office_level},
                coordinator_name = ${coordinator_name},
                teams_webhook_url = ${teams_webhook_url || null},
                reminder_time = ${reminder_time},
                cutoff_time = ${cutoff_time},
                timezone = ${timezone},
                vendor_message_template = ${vendor_message_template},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `;
        
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// --- Dashboard Orders & Summary ---
router.get('/orders', verifyAdmin, async (req, res) => {
    try {
        const menu = await getActiveMenu();
        if (!menu) return res.json({ orders: [] });

        const { rows: orders } = await sql`SELECT * FROM orders WHERE menu_id = ${menu.id} ORDER BY created_at DESC`;
        res.json({ orders, menuStatus: menu.status });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/summary', verifyAdmin, async (req, res) => {
    try {
        const menu = await getActiveMenu();
        if (!menu) return res.json({ summary: null });

        const { rows: orders } = await sql`SELECT * FROM orders WHERE menu_id = ${menu.id}`;
        
        const personGroups = {};
        const setGroups = {};
        let totalItems = 0;
        let totalPrice = 0;

        orders.forEach(order => {
            if (!personGroups[order.guest_name]) {
                personGroups[order.guest_name] = [];
            }
            personGroups[order.guest_name].push({ set: order.set_name, qty: order.quantity });

            if (!setGroups[order.set_name]) setGroups[order.set_name] = 0;
            setGroups[order.set_name] += order.quantity;
            
            totalItems += order.quantity;

            let basePrice = 9.90;
            if (order.add_meat === 1) basePrice += 4.50;
            if (order.add_vege === 1) basePrice += 2.00;
            totalPrice += (basePrice * order.quantity);
        });

        const formattedPersonLines = [];
        for (const [name, items] of Object.entries(personGroups)) {
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
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/vendor-message', verifyAdmin, async (req, res) => {
    try {
        const { rows: settingsRows } = await sql`SELECT * FROM app_settings WHERE id = 1`;
        const settings = settingsRows[0];
        
        const menu = await getActiveMenu();
        if (!menu) return res.status(400).json({ error: 'No active or closed menu available' });

        const { rows: orders } = await sql`SELECT * FROM orders WHERE menu_id = ${menu.id}`;
        
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

        const itemsStr = Object.entries(allItemsCounts)
            .sort((a, b) => a[0].localeCompare(b[0])) // Sort alphabetically so Set A is first
            .map(([set, qty]) => `${set} x${qty}`)
            .join(' ');

        // Use coordinator_name from settings (no more hardcoded "Kwek")
        const coordinatorName = settings.coordinator_name || 'Admin';
        const orderLines = [`${coordinatorName} - ${itemsStr}`];
        allRemarks.forEach(r => orderLines.push(r));

        // Next day date calculation
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() + 1);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[dateObj.getDay()];
        const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

        // Format cutoff time to 12h (e.g. 08:00 -> 8:00am)
        let cutoffDisplay = settings.cutoff_time || '';
        if (cutoffDisplay) {
            const [h, m] = cutoffDisplay.split(':').map(Number);
            const ampm = h >= 12 ? 'pm' : 'am';
            const h12 = h % 12 || 12;
            cutoffDisplay = `${h12}:${String(m).padStart(2, '0')}${ampm}`;
        }

        let message = settings.vendor_message_template || '';
        
        // Convert literal \n back to actual newlines
        message = message.replace(/\\n/g, '\n');

        const replacements = {
            'LEVEL': settings.office_level || '',
            'COMPANY_NAME': settings.company_name || '',
            'ORDER_LINES': orderLines.join('\n'),
            'CUTOFF_TIME': cutoffDisplay,
            'DAY': dayName,
            'DATE': formattedDate
        };

        // Replace both {KEY} and KEY (for backward compatibility / ease of use)
        for (const [key, val] of Object.entries(replacements)) {
            const regex = new RegExp(`{${key}}|\\b${key}\\b`, 'g');
            message = message.replace(regex, val);
        }

        res.json({ message });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// --- Colleagues Routes ---
router.get('/colleagues', verifyAdmin, async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM colleagues ORDER BY name ASC`;
        res.json({ colleagues: rows });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/colleagues', verifyAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        await sql`INSERT INTO colleagues (name) VALUES (${name.trim()})`;
        res.json({ message: 'Colleague added successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Database error or duplicate name' });
    }
});

router.delete('/colleagues/:id', verifyAdmin, async (req, res) => {
    try {
        await sql`DELETE FROM colleagues WHERE id = ${req.params.id}`;
        res.json({ message: 'Colleague deleted successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
