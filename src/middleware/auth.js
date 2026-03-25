const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'artisan_super_secret_key_change_me';

function verifyAdmin(req, res, next) {
    const token = req.cookies.admin_token;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No admin token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid session token' });
    }
}

module.exports = { verifyAdmin, JWT_SECRET };
