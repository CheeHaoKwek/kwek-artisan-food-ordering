const cron = require('node-cron');
const db = require('../db');
const teamsService = require('./teams');
const mailer = require('./mailer');

let reminderTask = null;
let cutoffTask = null;

function init() {
    try {
        const settings = db.prepare('SELECT reminder_time, cutoff_time, timezone FROM app_settings WHERE id = 1').get();
        if (!settings) return;

        // Stop existing tasks
        if (reminderTask) reminderTask.stop();
        if (cutoffTask) cutoffTask.stop();

        const [remHour, remMin] = settings.reminder_time.split(':');
        const [cutHour, cutMin] = settings.cutoff_time.split(':');

        // Reminder Cron
        reminderTask = cron.schedule(`${remMin} ${remHour} * * 1-5`, async () => {
            // Run only if there is an active menu
            const activeMenu = db.prepare("SELECT id FROM menus WHERE status = 'active'").get();
            if (activeMenu) {
                console.log('Running reminder cron job');
                await teamsService.sendReminderNotification().catch(console.error);
            }
        }, {
            scheduled: true,
            timezone: settings.timezone
        });

        // Cutoff Cron
        cutoffTask = cron.schedule(`${cutMin} ${cutHour} * * 1-5`, async () => {
            const activeMenu = db.prepare("SELECT id FROM menus WHERE status = 'active'").get();
            if (activeMenu) {
                console.log(`[${new Date().toLocaleTimeString()}] Running automated cutoff cron job...`);
                // Change status to closed
                db.prepare("UPDATE menus SET status = 'closed' WHERE id = ?").run(activeMenu.id);
                await teamsService.sendOrdersClosedNotification().catch(console.error);
                await mailer.sendOrderClosedEmail(process.env.SMTP_USER);
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] Cutoff cron fired, but ignored because no menu is currently active.`);
            }
        }, {
            scheduled: true,
            timezone: settings.timezone
        });

        console.log(`Scheduler initialized: Reminder at ${settings.reminder_time}, Cutoff at ${settings.cutoff_time} [${settings.timezone}]`);
    } catch (err) {
        console.error('Failed to initialize scheduler:', err);
    }
}

module.exports = { init };
