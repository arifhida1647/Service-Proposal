const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connection = require('./lib/db');
require('dotenv').config(); // Load dotenv


const app = express();
const port = process.env.PORT || 3001;

// Baca sertifikat
const sslCert = fs.readFileSync(path.join(__dirname, 'isrgrootx1.pem'));

// Konfigurasi database dengan SSL
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
                let warna = "";
                const iot = iotRow.status;
                const cam = camRow.status;

                if (cam === 0 && iot === 0) {
                    status = 0;
                    deskripsi = "available (cam & iot)";
                    warna = "bg-green-400";
                } else if (cam === 0 && iot === 1) {
                    status = 1;
                    deskripsi = "cam available, iot not available";
                    warna = "bg-yellow-400";
                } else if (cam === 0 && iot === 2) {
                    status = 2;
                    deskripsi = "cam available, iot not connected";
                    warna = "bg-green-400";
                } else if (cam === 1 && iot === 0) {
                    status = 3;
                    deskripsi = "cam not available, iot available";
                    warna = "bg-yellow-400";
                } else if (cam === 1 && iot === 1) {
                    status = 4;
                    deskripsi = "not available (cam & iot)";
                    warna = "bg-red-400";
                } else if (cam === 1 && iot === 2) {
                    status = 5;
                    deskripsi = "cam not available, iot not connected";
                    warna = "bg-red-400";
                } else if (cam === 2 && iot === 0) {
                    status = 6;
                    deskripsi = "cam not connected, iot available";
                    warna = "bg-green-400";
                } else if (cam === 2 && iot === 1) {
                    status = 7;
                    deskripsi = "cam not connected, iot not available";
                    warna = "bg-red-400";
                } else if (cam === 2 && iot === 2) {
                    status = 8;
                    deskripsi = "cam & iot not connected";
                    warna = "bg-gray-400";
                }


                // Simpan hanya jika semua nilai valid
                if (status !== null) {
                    const escapedDeskripsi = connection.escape(deskripsi); // string -> escape
                    const escapedWarna = connection.escape(warna);         // string -> escape
                    const insertQuery = `
                    INSERT INTO komparasi (id, slot, status, warna, deskripsi, updated_at)
                    VALUES (${iotRow.id}, ${iotRow.id}, ${status}, ${escapedWarna}, ${escapedDeskripsi}, NOW())
                    ON DUPLICATE KEY UPDATE 
                        status = VALUES(status),
                        warna = VALUES(warna),
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
setInterval(checkAndUpdateIotStatus, 5 * 60 * 1000); // 5 menit

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
    const query = `SELECT status FROM komparasi`; // ganti "komparasi" dengan nama tabel kamu

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching data:', err);
            res.status(500).json({ error: 'Failed to fetch data' });
            return;
        }

        let tersedia = 0;
        let kemungkinanTersedia = 0;
        let tidakTersedia = 0;

        results.forEach(row => {
            const status = row.status;

            if ([0, 2, 6].includes(status)) {
                tersedia++;
            } else if ([1, 3].includes(status)) {
                kemungkinanTersedia++;
            } else if ([4, 5, 7, 8].includes(status)) {
                tidakTersedia++;
            }
        });

        const data = {
            tersedia,
            kemungkinanTersedia,
            tidakTersedia
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