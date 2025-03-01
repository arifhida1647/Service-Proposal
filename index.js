const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // Load dotenv


const app = express();
const port = process.env.PORT || 3001;

// Baca sertifikat
const sslCert = fs.readFileSync(path.join(__dirname, 'isrgrootx1.pem'));

// Konfigurasi database dengan SSL
const connection = mysql.createConnection({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '1LeBgnPBg2enDXv.root',
    password: 'bZ5viB4YiopWa1vG',
    database: 'parkingsistem',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        ca: sslCert // Menambahkan sertifikat CA
    }
});

// Koneksikan ke database
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
        return;
    }
    console.log('Connected to the database.');
});

// Gunakan middleware CORS
app.use(cors());
app.use('/storage', express.static(path.join(__dirname, 'storage')));
// Middleware
app.use(express.json());

const STATIC_BEARER_TOKEN = process.env.BEARER_TOKEN; // Ambil token dari .env
// Middleware untuk validasi Bearer Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.split(' ')[1]; // Ambil token setelah "Bearer"
    if (token !== STATIC_BEARER_TOKEN) return res.status(403).json({ message: "Forbidden" });

    next(); // Lanjut ke route berikutnya jika token valid
};

// Endpoint untuk mengambil data dari tabel "iot"
app.get('/iot/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    const status = req.query.status;

    if (!status) {
        return res.status(400).json({
            message: 'Status query parameter is required'
        });
    }

    const query = 'UPDATE iot SET status = ? WHERE id = ?';
    connection.query(query, [status, id], (err, results) => {
        if (err) {
            console.error('Error updating data:', err.stack);
            return res.status(500).json({
                message: 'An error occurred',
                error: err.message
            });
        }

        if (results.affectedRows > 0) {
            return res.json({
                message: id + ' Data updated successfully',
            });
        } else {
            return res.status(404).json({
                message: 'Update failed or data not found'
            });
        }
    });
});

app.get('/cam/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    const status = req.query.status;

    if (!status) {
        return res.status(400).json({
            message: 'Status query parameter is required'
        });
    }

    const query = 'UPDATE cam SET status = ? WHERE id = ?';
    connection.query(query, [status, id], (err, results) => {
        if (err) {
            console.error('Error updating data:', err.stack);
            return res.status(500).json({
                message: 'An error occurred',
                error: err.message
            });
        }

        if (results.affectedRows > 0) {
            return res.json({
                message: id + ' Data updated successfully',
            });
        } else {
            return res.status(404).json({
                message: 'Update failed or data not found'
            });
        }
    });
});

app.get('/compare-status', (req, res) => {
    const query = `
        SELECT iot.id AS iot_id, cam.id AS cam_id, iot.status AS iot_status, cam.status AS cam_status
        FROM iot
        INNER JOIN cam ON iot.id = cam.id
        WHERE 
            (iot.status = 0 AND cam.status = 0) OR 
            (iot.status = 1 AND cam.status = 0) OR 
            (iot.status = 0 AND cam.status = 1) OR
            (iot.status = 1 AND cam.status = 1)
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching data:', err);
            res.status(500).json({ error: 'Failed to fetch data' });
            return;
        }
        const bothZero = results.filter(row => row.iot_status === 0 && row.cam_status === 0);
        const oneOneOtherZero = results.filter(row => (row.iot_status === 1 && row.cam_status === 0) || (row.iot_status === 0 && row.cam_status === 1));
        const bothOne = results.filter(row => row.iot_status === 1 && row.cam_status === 1);

        const data = {
            bothZeroCount: bothZero.length,
            oneOneOtherZeroCount: oneOneOtherZero.length,
            bothOneCount: bothOne.length
        };

        res.json(data);
    });
});

// Endpoint untuk memperbarui status
app.post('/update-status-iot-s3',  authenticateToken, async (req, res) => {
    const { statusArray } = req.body;

    // Validasi data
    if (!Array.isArray(statusArray)) {
        return res.status(400).json({ error: 'Data harus berupa array.' });
    }

    if (statusArray.length !== 17) {
        return res.status(400).json({ error: 'Array harus memiliki panjang 17.' });
    }

    const isValid = statusArray.every(value => value === 0 || value === 1 || value === 2);
    if (!isValid) {
        return res.status(400).json({ error: 'Array tidak valid.' });
    }

    // Bangun query bulk update
    let updateQuery = 'UPDATE iot SET status = CASE id ';
    statusArray.forEach((status, index) => {
        const id = index + 1; // ID dimulai dari 1
        updateQuery += `WHEN ${id} THEN ${status} `;
    });
    updateQuery += 'END WHERE id IN (';
    updateQuery += statusArray.map((_, index) => index + 1).join(', ');
    updateQuery += ');';

    // Eksekusi query
    connection.query(updateQuery, (err, results) => {
        if (err) {
            console.error('Error updating status:', err);
            return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui status.' });
        }

        res.status(200).json({ message: 'Status berhasil diperbarui.' });
    });
});

// Endpoint untuk memperbarui status
app.post('/update-status-iot-s1',  authenticateToken, async (req, res) => {
    const { statusArray } = req.body;

    // Validasi data
    if (!Array.isArray(statusArray)) {
        return res.status(400).json({ error: 'Data harus berupa array.' });
    }

    if (statusArray.length !== 3) {
        return res.status(400).json({ error: 'Array harus memiliki panjang 3.' });
    }

    const isValid = statusArray.every(value => value === 0 || value === 1 || value === 2);
    if (!isValid) {
        return res.status(400).json({ error: 'Array tidak valid.' });
    }

    // Bangun query bulk update
    let updateQuery = 'UPDATE iot SET status = CASE id ';
    statusArray.forEach((status, index) => {
        const id = index + 18; // ID dimulai dari 18
        updateQuery += `WHEN ${id} THEN ${status} `;
    });
    updateQuery += 'END WHERE id IN (';
    updateQuery += statusArray.map((_, index) => index + 18).join(', ');
    updateQuery += ');';

    // Eksekusi query
    connection.query(updateQuery, (err, results) => {
        if (err) {
            console.error('Error updating status:', err);
            return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui status.' });
        }

        res.status(200).json({ message: 'Status berhasil diperbarui.' });
    });
});
// Endpoint untuk memperbarui status
app.post('/update-status-cam',  authenticateToken, async (req, res) => {
    const { statusArray } = req.body;

    // Validasi data
    if (!Array.isArray(statusArray)) {
        return res.status(400).json({ error: 'Data harus berupa array.' });
    }

    if (statusArray.length !== 20) {
        return res.status(400).json({ error: 'Array harus memiliki panjang 17.' });
    }

    const isValid = statusArray.every(value => value === 0 || value === 1 || value === 2);
    if (!isValid) {
        return res.status(400).json({ error: 'Array tidak valid.' });
    }

    // Bangun query bulk update
    let updateQuery = 'UPDATE cam SET status = CASE id ';
    statusArray.forEach((status, index) => {
        const id = index + 1; // ID dimulai dari 1
        updateQuery += `WHEN ${id} THEN ${status} `;
    });
    updateQuery += 'END WHERE id IN (';
    updateQuery += statusArray.map((_, index) => index + 1).join(', ');
    updateQuery += ');';

    // Eksekusi query
    connection.query(updateQuery, (err, results) => {
        if (err) {
            console.error('Error updating status:', err);
            return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui status.' });
        }

        res.status(200).json({ message: 'Status berhasil diperbarui.' });
    });
});
// Mulai server// Contoh endpoint
app.get("/", (req, res) => {
    res.send("Hello from Express on Vercel!");
});

app.listen(port, () => console.log(`Listening to port ${port} (http://localhost:${port})`));