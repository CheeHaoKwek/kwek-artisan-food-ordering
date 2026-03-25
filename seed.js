const { sql, initDB } = require('./src/db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
    try {
        // Create all tables first
        await initDB();

        const username = process.env.ADMIN_USERNAME;
        const password = process.env.ADMIN_PASSWORD;

        const hash = await bcrypt.hash(password, 10);
        await sql`
            INSERT INTO users (username, password)
            VALUES (${username}, ${hash})
            ON CONFLICT (username) DO NOTHING
        `;
        console.log(`Seed complete! Admin created (username: ${username}).`);
    } catch (err) {
        console.error("Seed error:", err.message);
    } finally {
        process.exit(0);
    }
}

seed();
