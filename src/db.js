const { sql } = require('@vercel/postgres');

let initialized = false;

async function initDB() {
    if (initialized) return;

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE,
                password VARCHAR(255)
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS menus (
                id SERIAL PRIMARY KEY,
                date VARCHAR(255) NOT NULL,
                image_url TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                menu_id INTEGER REFERENCES menus(id),
                guest_name VARCHAR(255) NOT NULL,
                set_name VARCHAR(255) NOT NULL,
                quantity INTEGER DEFAULT 1,
                remark TEXT,
                submission_ip VARCHAR(255),
                add_meat INTEGER DEFAULT 0,
                add_vege INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                company_name VARCHAR(255) NOT NULL,
                office_level VARCHAR(255) NOT NULL,
                teams_webhook_url TEXT,
                reminder_time VARCHAR(50) NOT NULL,
                cutoff_time VARCHAR(50) NOT NULL,
                timezone VARCHAR(50) NOT NULL,
                vendor_message_template TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Check app settings
        const { rows: settingsRows } = await sql`SELECT * FROM app_settings WHERE id = 1`;
        if (settingsRows.length === 0) {
            await sql`
                INSERT INTO app_settings (
                    id, company_name, office_level, reminder_time, cutoff_time, timezone, vendor_message_template
                ) VALUES (
                    1, 
                    'Agmo Artisan', 
                    'L8', 
                    '10:00', 
                    '11:00', 
                    'Asia/Kuala_Lumpur', 
                    '1){office_level}\n{company_name}\n{ORDER_LINES}'
                )
            `;
        }

        initialized = true;
        console.log("Database initialized on PostgreSQL.");
    } catch (e) {
        console.error("Database initialization failed:", e.message);
    }
}

module.exports = {
    sql,
    initDB
};
