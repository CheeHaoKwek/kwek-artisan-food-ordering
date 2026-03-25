const bcrypt = require('bcryptjs');
const db = require('./src/db');

async function runSeed() {
    console.log('Seeding admin user...');
    
    const existingAdmin = db.prepare("SELECT * FROM admin_users WHERE username = 'admin'").get();
    
    if (existingAdmin) {
        console.log('Admin user already exists.');
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);

    db.prepare(`
        INSERT INTO admin_users (username, password_hash)
        VALUES (?, ?)
    `).run('admin', passwordHash);

    console.log('Seed complete! Default admin created (username: admin, password: admin123).');
}

runSeed().catch(console.error);
