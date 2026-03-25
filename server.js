require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static directories
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if missing
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Connect routes
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/admin/menu', require('./src/routes/menu'));
app.use('/api/public', require('./src/routes/public'));

// Internal App Setup
const db = require('./src/db'); 

// Scheduler init
require('./src/services/scheduler').init();

app.listen(PORT, () => {
    console.log(`Food Ordering Automation System is running on http://localhost:${PORT}`);
    console.log(`Admin Dashboard: http://localhost:${PORT}/admin.html`);
});
