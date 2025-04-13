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

function compareIotAndCam() {
    const queryIot = `SELECT id, status FROM iot`;
    const queryCam = `SELECT id, status FROM cam`;

    connection.query(queryIot, (err, iotResults) => {
        if (err) return console.error('Gagal ambil data iot:', err);

        connection.query(queryCam, (err2, camResults) => {
            if (err2) return console.error('Gagal ambil data cam:', err2);

            iotResults.forEach((iotRow) => {
                const camRow = camResults.find((c) => c.id === iotRow.id);
                if (!camRow) return;

                let status = null;
                let deskripsi = "";

                const iot = iotRow.status;
                const cam = camRow.status;

                // Logika komparasi
                if (iot === 0 && cam === 1) {
                    status = 1;
                    deskripsi = "camera check";
                } else if (iot === 1 && cam === 0) {
                    status = 0;
                    deskripsi = "camera not check dan iot not check";
                } else if (iot === 0 && cam === 0) {
                    status = 0;
                    deskripsi = "camera not check dan iot not check";
                } else if (iot === 1 && cam === 1) {
                    status = 1;
                    deskripsi = "camera check dan iot check";
                } else if (iot === 2 && cam === 0) {
                    status = 0;
                    deskripsi = "iot not connected dan camera not check";
                } else if (iot === 2 && cam === 1) {
                    status = 1;
                    deskripsi = "iot not connected dan camera check";
                } else if (iot === 2 && cam === 2) {
                    status = 2;
                    deskripsi = "iot not connected dan camera not connected";
                } else if (iot === 0 && cam === 2) {
                    status = 0;
                    deskripsi = "cam not connected dan iot not check";
                } else if (iot === 1 && cam === 2) {
                    status = 1;
                    deskripsi = "cam not connected dan iot check";
                }

                // Simpan hanya jika semua nilai valid
                if (status !== null && deskripsi) {
                    const escapedDeskripsi = connection.escape(deskripsi);
                    const insertQuery = `
                        INSERT INTO komparasi (id, slot, status, deskripsi, updated_at)
                        VALUES (${iotRow.id}, ${iotRow.id}, ${status}, ${escapedDeskripsi}, NOW())
                        ON DUPLICATE KEY UPDATE 
                            status = VALUES(status),
                            deskripsi = VALUES(deskripsi),
                            updated_at = NOW()
                    `;

                    connection.query(insertQuery, (err3) => {
                        if (err3) console.error('Gagal update komparasi:', err3);
                    });
                } else {
                    console.warn(`Lewati id ${iotRow.id} karena status/deskripsi tidak valid.`);
                }
            });
        });
    });
}

// Jalanin tiap 2 detik
setInterval(compareIotAndCam, 2000);

function checkAndUpdateCamStatus() {
    const query = `SELECT updated_at FROM cam ORDER BY updated_at DESC LIMIT 1`;

    connection.query(query, (err, results) => {
        if (err) return console.error('Gagal mengambil updated_at cam:', err);
        if (results.length === 0) return console.warn('Tidak ada data di tabel cam.');

        const latestUpdatedAt = new Date(results[0].updated_at);
        const now = new Date();
        const diffInMinutes = (now - latestUpdatedAt) / 60000;

        if (diffInMinutes > 5) {
            const updateQuery = `UPDATE cam SET status = 2`;
            connection.query(updateQuery, (err2) => {
                if (err2) {
                    console.error('Gagal update status cam ke 2:', err2);
                } else {
                    console.log('Status semua data di iot diupdate ke 2 karena tidak update lebih dari 5 menit.');
                }
            });
        } else {
            console.log('CAM masih aktif, tidak perlu update.');
        }
    });
}

setInterval(checkAndUpdateCamStatus, 5 * 60 * 1000); // 5 menit

function checkAndUpdateIotStatus() {
    const query = `SELECT updated_at FROM iot ORDER BY updated_at DESC LIMIT 1`;

    connection.query(query, (err, results) => {
        if (err) return console.error('Gagal mengambil updated_at iot:', err);
        if (results.length === 0) return console.warn('Tidak ada data di tabel iot.');

        const latestUpdatedAt = new Date(results[0].updated_at);
        const now = new Date();
        const diffInMinutes = (now - latestUpdatedAt) / 60000;

        if (diffInMinutes > 5) {
            const updateQuery = `UPDATE iot SET status = 2`;
            connection.query(updateQuery, (err2) => {
                if (err2) {
                    console.error('Gagal update status iot ke 2:', err2);
                } else {
                    console.log('Status semua data di iot diupdate ke 2 karena tidak update lebih dari 5 menit.');
                }
            });
        } else {
            console.log('IOT masih aktif, tidak perlu update.');
        }
    });
}
setInterval(checkAndUpdateIotStatus,  5 * 60 * 1000); // 5 menit

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
app.post('/update-status-iot-s3', authenticateToken, async (req, res) => {
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
app.post('/update-status-iot-s1', authenticateToken, async (req, res) => {
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



app.post('/update-status-cam', authenticateToken, async (req, res) => {
    const { statusArray } = req.body;

    // Validasi data
    if (!Array.isArray(statusArray)) {
        return res.status(400).json({ error: 'Data harus berupa array.' });
    }

    if (statusArray.length !== 20) {
        return res.status(400).json({ error: 'Array harus memiliki panjang 20.' });
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