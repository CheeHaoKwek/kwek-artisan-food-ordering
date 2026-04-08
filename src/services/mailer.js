const nodemailer = require('nodemailer');
const { sql } = require('../db');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendOrderClosedEmail(targetEmail) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('Mail skipped: SMTP_USER or SMTP_PASS is missing in your environment configuration.');
        return;
    }

    // Fetch coordinator name dynamically from settings
    let coordinatorName = 'Admin';
    try {
        const { rows } = await sql`SELECT coordinator_name FROM app_settings WHERE id = 1`;
        if (rows[0] && rows[0].coordinator_name) {
            coordinatorName = rows[0].coordinator_name;
        }
    } catch (e) {
        console.warn('Could not fetch coordinator name for email:', e.message);
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    try {
        const info = await transporter.sendMail({
            from: `"Artisan Food Bot" <${process.env.SMTP_USER}>`,
            to: targetEmail,
            subject: "🚨 ACTION REQUIRED: Lunch Orders Closed!",
            text: `Hello ${coordinatorName},\n\nThe lunch order window has now officially closed. Please log into the Admin Dashboard immediately to review the aggregated order summary and send the final list to the vendor.\n\nDashboard Link: ${appUrl}/admin.html\n\nThanks,\nFood Ordering Automation System`,
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #e11d48;">🚨 Lunch Orders Closed!</h2>
                    <p>Hello ${coordinatorName},</p>
                    <p>The lunch order window has now officially closed.</p>
                    <p><strong>Action Required:</strong> Please log into the Admin Dashboard to review the aggregated summary and forward the generated list to the vendor via WhatsApp.</p>
                    <a href="${appUrl}/admin.html" style="display:inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Open Admin Dashboard</a>
                    <br><br>
                    <p style="color: grey; font-size: 12px;">Automated by Kwek's Artisan Food Ordering System</p>
                </div>
            `
        });
        console.log(`Email successfully sent to ${targetEmail} (Message ID: ${info.messageId})`);
    } catch (error) {
        console.error('Failed to send email:', error);
    }
}

module.exports = {
    sendOrderClosedEmail
};
