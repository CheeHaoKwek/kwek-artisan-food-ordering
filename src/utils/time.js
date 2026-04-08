const { sql } = require('../db');

/**
 * Convert an HH:MM string to total minutes.
 */
function timeToMins(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Get the current time in a given IANA timezone, in total minutes since midnight.
 */
function getCurrentMinsInTz(timezone) {
    const now = new Date();
    const options = { timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit' };
    const tzTimeStr = new Intl.DateTimeFormat('en-GB', options).format(now);
    const [tzHour, tzMin] = tzTimeStr.split(':').map(Number);
    return tzHour * 60 + tzMin;
}

/**
 * Returns true if the current time (in the configured timezone) is past the cutoff_time.
 */
async function isPastCutoff() {
    try {
        const { rows } = await sql`SELECT cutoff_time, timezone FROM app_settings WHERE id = 1`;
        const settings = rows[0];
        if (!settings || !settings.cutoff_time) return false;

        const nowMins = getCurrentMinsInTz(settings.timezone);
        const cutoffMins = timeToMins(settings.cutoff_time);

        return nowMins >= cutoffMins;
    } catch (e) {
        console.error('isPastCutoff error:', e.message);
        return false;
    }
}

module.exports = { isPastCutoff, timeToMins, getCurrentMinsInTz };
