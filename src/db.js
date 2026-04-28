const { Pool } = require('pg');

// Standard PostgreSQL pool — works with Supabase, Neon, Railway, or any Postgres host
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Drop-in replacement for @vercel/postgres `sql` template tag.
// Returns { rows, rowCount } to match the original API used across all routes.
const sql = async (strings, ...values) => {
    let text = '';
    strings.forEach((str, i) => {
        text += str;
        if (i < values.length) {
            text += `$${i + 1}`;
        }
    });
    const result = await pool.query(text, values);
    return { rows: result.rows, rowCount: result.rowCount };
};

async function initDB() {
    // Check a lightweight DB-level flag so we only run full init once,
    // even across multiple Vercel cold starts / serverless instances.
    // This reduces cold-start queries from 10+ down to just 1.
    try {
        const { rows } = await sql`
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'db_initialized' LIMIT 1
        `;
        if (rows.length > 0) {
            // Already initialized — skip all setup queries
            return;
        }
    } catch (e) {
        // If the check itself fails, fall through to full init
    }

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
                coordinator_name VARCHAR(255) NOT NULL DEFAULT 'Kwek',
                teams_webhook_url TEXT,
                reminder_time VARCHAR(50) NOT NULL,
                cutoff_time VARCHAR(50) NOT NULL,
                timezone VARCHAR(50) NOT NULL,
                vendor_message_template TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Migrate: add coordinator_name column for existing databases
        await sql`
            ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS coordinator_name VARCHAR(255) NOT NULL DEFAULT 'Kwek';
        `;

        // Migrate: add set_b_name column for menus
        await sql`
            ALTER TABLE menus ADD COLUMN IF NOT EXISTS set_b_name VARCHAR(255) NOT NULL DEFAULT 'Set B';
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS colleagues (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `;

        // Seed app settings
        const { rows: settingsRows } = await sql`SELECT * FROM app_settings WHERE id = 1`;
        if (settingsRows.length === 0) {
            await sql`
                INSERT INTO app_settings (
                    id, company_name, office_level, coordinator_name, reminder_time, cutoff_time, timezone, vendor_message_template
                ) VALUES (
                    1, 
                    'Agmo Artisan', 
                    'L8',
                    'Kwek',
                    '10:00', 
                    '11:00', 
                    'Asia/Kuala_Lumpur', 
                    'MBMR Order List\n{DAY} {DATE}\nClose order : {CUTOFF_TIME} of order date\n\nAttached payment receipt with the updated list:\n\n1) {LEVEL}\n{COMPANY_NAME}\n{ORDER_LINES}'
                )
            `;
        }

        // Seed colleagues
        const { rows: colleagueRows } = await sql`SELECT id FROM colleagues LIMIT 1`;
        if (colleagueRows.length === 0) {
            const defaultColleagues = [
                'Di Yao', 'Isaac', 'Jacqueline', 'Jason', 'Jayron', 
                'Kwek', 'Lai', 'Michael', 'Ru Fang', 'Sean', 
                'Soo Hao', 'Vincent', 'Wen Xuan', 'Willy'
            ];
            for (const name of defaultColleagues) {
                await sql`INSERT INTO colleagues (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
            }
        }

        // Plant the DB-level flag so future cold starts skip all of the above
        await sql`CREATE TABLE IF NOT EXISTS db_initialized (initialized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
        await sql`INSERT INTO db_initialized DEFAULT VALUES`;

        console.log("Database initialized on PostgreSQL.");
    } catch (e) {
        console.error("Database initialization failed:", e.message);
    }
}

module.exports = {
    sql,
    initDB
};
