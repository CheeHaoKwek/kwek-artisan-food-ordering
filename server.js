const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { sql, initDB } = require('./src/db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const adminRoutes = require('./src/routes/admin');
const menuRoutes = require('./src/routes/menu');
const publicRoutes = require('./src/routes/public');
const teamsService = require('./src/services/teams');
const mailer = require('./src/services/mailer');

app.use('/api/admin', adminRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/public', publicRoutes);

// Vercel Cron API Endpoint
app.get('/api/cron', async (req, res) => {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        await initDB();
        
        const { rows: menuRows } = await sql`SELECT id FROM menus WHERE status = 'active'`;
        const activeMenu = menuRows[0];
        
        if (!activeMenu) {
            return res.status(200).json({ status: 'Skipped - no active menu' });
        }

        const { rows: settingsRows } = await sql`SELECT reminder_time, cutoff_time, timezone FROM app_settings WHERE id = 1`;
        const settings = settingsRows[0];
        if (!settings || !settings.cutoff_time) return res.status(500).json({ error: 'Settings not found' });

        const now = new Date();
        const options = { timeZone: settings.timezone, hour12: false, hour: '2-digit', minute: '2-digit' };
        const tzTimeStr = new Intl.DateTimeFormat('en-GB', options).format(now);
        const [tzHour, tzMin] = tzTimeStr.split(':').map(Number);
        const nowMins = tzHour * 60 + tzMin;

        // Check Cutoff
        const [cutHour, cutMin] = settings.cutoff_time.split(':').map(Number);
        const cutoffMins = cutHour * 60 + cutMin;
        
        if (nowMins >= cutoffMins) {
            await sql`UPDATE menus SET status = 'closed' WHERE id = ${activeMenu.id}`;
            await teamsService.sendOrdersClosedNotification().catch(console.error);
            await mailer.sendOrderClosedEmail(process.env.SMTP_USER).catch(console.error);
            return res.status(200).json({ status: 'Cutoff triggered and closed menu' });
        }

        // Check Reminder
        const [remHour, remMin] = settings.reminder_time.split(':').map(Number);
        const remMins = remHour * 60 + remMin;

        if (nowMins === remMins) {
            await teamsService.sendReminderNotification().catch(console.error);
            return res.status(200).json({ status: 'Reminder triggered' });
        }

        res.status(200).json({ status: 'Ok - no action needed at this time' });

    } catch (err) {
        console.error("Cron Error", err);
        res.status(500).json({ error: 'Cron execution failed' });
    }
});

// Export the express app for Vercel Serverless Function wrapper
module.exports = app;

// Listen only if not in production
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    
    // Initialize DB locally on boot
    initDB().then(() => {
        app.listen(PORT, () => {
            console.log(`Development Server running on http://localhost:${PORT}`);
        });
    });
}
