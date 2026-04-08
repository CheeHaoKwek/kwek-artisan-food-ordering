const jwt = require('jsonwebtoken');
const { sql } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || (
    process.env.NODE_ENV === 'production'
        ? (() => { throw new Error('JWT_SECRET must be set in production!'); })()
        : 'super_secret_artisan_key_dev_only'
);

async function verifyAdmin(req, res, next) {
    const token = req.cookies.admin_token;
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await sql`SELECT id, username FROM users WHERE id = ${decoded.id}`;
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'User no longer exists' });
        }
        
        req.admin = rows[0];
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { verifyAdmin, JWT_SECRET };
