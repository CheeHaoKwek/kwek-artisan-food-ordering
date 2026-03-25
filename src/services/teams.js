const https = require('https');
const { sql } = require('../db');

function sendPayload(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
        if (!webhookUrl) return resolve(); // Skip if no webhook configured

        try {
            const { URL } = require('url');
            const urlObj = new URL(webhookUrl);
            const dataStr = JSON.stringify(payload);

            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + (urlObj.search || ''),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(dataStr)
                }
            };

            const req = https.request(options, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => responseBody += chunk);
                res.on('end', () => {
                    console.log(`Teams Webhook responded with status: ${res.statusCode}`);
                    if (res.statusCode >= 400 || responseBody.includes('error')) {
                        console.error(`Teams Webhook Payload Error: ${responseBody}`);
                    }
                    resolve(responseBody);
                });
            });

            req.on('error', (e) => {
                console.error(`Teams Webhook HTTP Error: ${e.message}`);
                reject(e);
            });
            req.write(dataStr);
            req.end();
        } catch (e) {
            console.error('Error sending payload to webhook:', e.message);
            resolve(); // Do not crash
        }
    });
}

function createAdaptiveCardPayload(title, text, mentionEveryone = false) {
    const appUrl = process.env.APP_URL || "http://localhost:3000";

    const bodyBlocks = [];

    if (mentionEveryone) {
        bodyBlocks.push({
            "type": "TextBlock",
            "text": "<at>everyone</at>",
            "wrap": true
        });
    }

    bodyBlocks.push(
        {
            "type": "TextBlock",
            "size": "Large",
            "weight": "Bolder",
            "text": title,
            "wrap": true
        },
        {
            "type": "TextBlock",
            "text": text,
            "wrap": true
        }
    );

    const payload = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "msteams": mentionEveryone ? {
                        "entities": [
                            {
                                "type": "mention",
                                "text": "<at>everyone</at>",
                                "mentioned": {
                                    "id": "everyone",
                                    "name": "everyone"
                                }
                            }
                        ]
                    } : undefined,
                    "body": bodyBlocks,
                    "actions": [
                        {
                            "type": "Action.OpenUrl",
                            "title": "Open Ordering Portal",
                            "url": appUrl
                        }
                    ]
                }
            }
        ]
    };

    return payload;
}

async function sendMenuOpenedNotification() {
    try {
        const { rows } = await sql`SELECT teams_webhook_url, cutoff_time FROM app_settings WHERE id = 1`;
        const settings = rows[0];
        if (!settings || !settings.teams_webhook_url) return;

        const payload = createAdaptiveCardPayload(
            "🍔 Today's Lunch Menu is Open!", 
            `The daily menu has been updated. Please check the portal and submit your orders.\n\n**Cutoff time: ${settings.cutoff_time}**`,
            true // @everyone mention
        );

        return sendPayload(settings.teams_webhook_url, payload);
    } catch (e) {
        console.error('Teams Notify Error:', e);
    }
}

async function sendReminderNotification() {
    try {
        const { rows } = await sql`SELECT teams_webhook_url, cutoff_time FROM app_settings WHERE id = 1`;
        const settings = rows[0];
        if (!settings || !settings.teams_webhook_url) return;

        const payload = createAdaptiveCardPayload(
            "⏰ Last Call for Food Orders!", 
            `If you haven't ordered yet, please submit your orders as soon as possible before the cutoff time.\n\n**Cutoff is approaching at ${settings.cutoff_time}**`
        );

        return sendPayload(settings.teams_webhook_url, payload);
    } catch (e) {
        console.error('Teams Notify Error:', e);
    }
}

async function sendOrdersClosedNotification() {
    try {
        const { rows } = await sql`SELECT teams_webhook_url FROM app_settings WHERE id = 1`;
        const settings = rows[0];
        if (!settings || !settings.teams_webhook_url) return;

        const payload = createAdaptiveCardPayload(
            "🔒 Ordering is now Closed", 
            "The administrator will consolidate the orders and send them to the vendor."
        );

        return sendPayload(settings.teams_webhook_url, payload);
    } catch (e) {
        console.error('Teams Notify Error:', e);
    }
}

module.exports = {
    sendMenuOpenedNotification,
    sendReminderNotification,
    sendOrdersClosedNotification
};
