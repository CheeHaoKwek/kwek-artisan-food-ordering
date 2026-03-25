const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        menu_date DATE NOT NULL,
        image_url TEXT NOT NULL,
        status TEXT CHECK(status IN ('draft', 'active', 'closed')) DEFAULT 'draft',
        uploaded_by INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        menu_id INTEGER NOT NULL,
        guest_name TEXT NOT NULL,
        set_name TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        remark TEXT,
        submission_ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (menu_id) REFERENCES menus(id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        company_name TEXT NOT NULL,
        office_level TEXT NOT NULL,
        teams_webhook_url TEXT,
        reminder_time TEXT NOT NULL,
        cutoff_time TEXT NOT NULL,
        timezone TEXT NOT NULL,
        vendor_message_template TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Safe migrations for new columns
try { db.exec('ALTER TABLE orders ADD COLUMN add_meat INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE orders ADD COLUMN add_vege INTEGER DEFAULT 0'); } catch (e) {}

// Insert default settings if they don't exist
const getSettings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
if (!getSettings) {
    db.prepare(`
        INSERT INTO app_settings (
            id, company_name, office_level, reminder_time, cutoff_time, timezone, vendor_message_template
        ) VALUES (
            1, 'Agmo Artisan', '8', '20:30', '21:00', 'Asia/Kuala_Lumpur', 
            'MBMR Order List\\nDAY DATE\\nClose order : 8:00am of order date\\n\\nAttached payment receipt with the updated list:\\n\\n1)L{LEVEL}\\n{COMPANY_NAME}\\n{ORDER_LINES}'
        )
    `).run();
}

module.exports = db;
