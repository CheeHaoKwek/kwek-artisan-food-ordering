const nodemailer = require('nodemailer');

// To actually send emails, these need to be configured safely in your real deployment environment
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
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

    try {
        const info = await transporter.sendMail({
            from: `"Artisan Food Bot" <${process.env.SMTP_USER}>`,
            to: targetEmail,
            subject: "🚨 ACTION REQUIRED: Lunch Orders Closed!",
            text: "Hello Chee Hao,\n\nThe lunch order window has now officially closed. Please log into the Admin Dashboard immediately to review the aggregated order summary and send the final list to the vendor.\n\nDashboard Link: http://localhost:3000/admin.html\n\nThanks,\nFood Ordering Automation System",
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #e11d48;">🚨 Lunch Orders Closed!</h2>
                    <p>Hello Chee Hao,</p>
                    <p>The lunch order window has now officially closed.</p>
                    <p><strong>Action Required:</strong> Please log into the Admin Dashboard to review the aggregated summary and forward the generated list to the vendor via WhatsApp.</p>
                    <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin.html" style="display:inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Open Admin Dashboard</a>
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
