const { sql } = require('./src/db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
    try {
        const hash = await bcrypt.hash('admin123', 10);
        await sql`
            INSERT INTO users (username, password)
            VALUES ('admin', ${hash})
            ON CONFLICT (username) DO NOTHING
        `;
        console.log("Seed complete! Default admin created (username: admin, password: admin123).");
    } catch (err) {
        console.error("Seed error:", err.message);
    }
}

seed();
