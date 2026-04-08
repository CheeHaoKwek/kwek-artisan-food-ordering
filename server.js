const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { sql, initDB } = require('./src/db');
const { timeToMins, getCurrentMinsInTz } = require('./src/utils/time');

const app = express();

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", "*.public.blob.vercel-storage.com", "public.blob.vercel-storage.com"],
        },
    },
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000'),
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
const adminRoutes = require('./src/routes/admin');
const menuRoutes = require('./src/routes/menu');
const publicRoutes = require('./src/routes/public');
const teamsService = require('./src/services/teams');
const mailer = require('./src/services/mailer');

app.use('/api/admin', adminRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/public', publicRoutes);

// --- Vercel Cron API Endpoint ---
// Rate-limit the cron endpoint: only 5 requests per minute
const cronLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });

app.get('/api/cron', cronLimiter, async (req, res) => {
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

        const nowMins = getCurrentMinsInTz(settings.timezone);

        // Check Cutoff
        const cutoffMins = timeToMins(settings.cutoff_time);
        
        if (nowMins >= cutoffMins) {
            await sql`UPDATE menus SET status = 'closed' WHERE id = ${activeMenu.id}`;
            await teamsService.sendOrdersClosedNotification().catch(console.error);
            await mailer.sendOrderClosedEmail(process.env.SMTP_USER).catch(console.error);
            return res.status(200).json({ status: 'Cutoff triggered and closed menu' });
        }

        // Check Reminder
        const remMins = timeToMins(settings.reminder_time);

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

// --- Central Error Handler ---
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
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
