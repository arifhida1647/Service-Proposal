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
    const logBuffer = [];

    const queryIot = `SELECT id, status FROM iot`;
    const queryCam = `SELECT id, status FROM cam`;

    connection.query(queryIot, (err, iotResults) => {
        if (err) {
            logBuffer.push("Gagal ambil data iot: " + err.message);
            return simpanLogAkhir();
        }

        connection.query(queryCam, (err2, camResults) => {
            if (err2) {
                logBuffer.push("Gagal ambil data cam: " + err2.message);
                return simpanLogAkhir();
            }

            iotResults.forEach((iotRow) => {
                const camRow = camResults.find((c) => c.id === iotRow.id);
                if (!camRow) {
                    logBuffer.push(`Slot ${iotRow.id} tidak ditemukan di cam.`);
                    return;
                }

                let status = null;
                const iot = iotRow.status;
                const cam = camRow.status;

                if (cam === 0 && iot === 0) status = 0;
                else if (cam === 0 && iot === 1) status = 1;
                else if (cam === 0 && iot === 2) status = 2;
                else if (cam === 1 && iot === 0) status = 3;
                else if (cam === 1 && iot === 1) status = 4;
                else if (cam === 1 && iot === 2) status = 5;
                else if (cam === 2 && iot === 0) status = 6;
                else if (cam === 2 && iot === 1) status = 7;
                else if (cam === 2 && iot === 2) status = 8;

                if (status !== null) {
                    const warnaMap = {
                        0: "bg-green-400",
                        1: "bg-yellow-400",
                        2: "bg-green-400",
                        3: "bg-yellow-400",
                        4: "bg-red-400",
                        5: "bg-red-400",
                        6: "bg-green-400",
                        7: "bg-red-400",
                        8: "bg-gray-400"
                    };

                    const statusDescriptions = {
                        0: "cam & iot check",
                        1: "Cam check",
                        2: "Cam check",
                        3: "IoT check",
                        4: "cam & iot not check",
                        5: "Cam check",
                        6: "IoT check",
                        7: "IoT check",
                        8: "Cam & IoT not connected"
                    };

                    const warna = connection.escape(warnaMap[status]);
                    const deskripsiText = statusDescriptions[status] || `Status ${status}`;
                    const deskripsi = connection.escape(deskripsiText);

                    const insertQuery = `
                        INSERT INTO komparasi (id, slot, status, warna, deskripsi, updated_at)
                        VALUES (${iotRow.id}, ${iotRow.id}, ${status}, ${warna}, ${deskripsi}, NOW())
                        ON DUPLICATE KEY UPDATE 
                            status = VALUES(status),
                            warna = VALUES(warna),
                            deskripsi = VALUES(deskripsi),
                            updated_at = NOW()
                    `;

                    connection.query(insertQuery, (err3) => {
                        if (err3) {
                            logBuffer.push(`Gagal update komparasi ID ${iotRow.id}: ${err3.message}`);
                        }
                    });
                } else {
                    logBuffer.push(`Lewati id ${iotRow.id} karena kombinasi status tidak valid.`);
                }
            });

            logBuffer.push("Fungsi compareIotAndCam berhasil dijalankan.");
            simpanLogAkhir();
        });
    });

    function simpanLogAkhir() {
        if (logBuffer.length === 0) return;

        const values = logBuffer.map(msg => `(${connection.escape(msg)}, 1)`).join(", ");
        const logQuery = `INSERT INTO logdata (keterangan,type) VALUES ${values}`;

        connection.query(logQuery, (err) => {
            if (err) {
                console.error('Gagal menyimpan log akhir:', err);
            } else {
                console.log('Log compareIotAndCam disimpan.');
            }
        });
    }
}

// Jalanin tiap 2 detik
setInterval(compareIotAndCam, 2000);

function checkAndUpdateCamStatus() {
    const query = `SELECT updated_at FROM cam ORDER BY updated_at DESC LIMIT 1`;

    connection.query(query, (err, results) => {
        if (err) {
            const errorLog = connection.escape("Gagal mengambil updated_at cam: " + err.message);
            connection.query(`INSERT INTO logdata (keterangan,type) VALUES (${errorLog},2)`);
            return console.error('Gagal mengambil updated_at cam:', err);
        }

        if (results.length === 0) {
            const warningLog = connection.escape("Tidak ada data di tabel cam.");
            connection.query(`INSERT INTO logdata (keterangan,type) VALUES (${warningLog},2)`);
            return console.warn('Tidak ada data di tabel cam.');
        }

        const latestUpdatedAt = new Date(results[0].updated_at);
        const now = new Date();
        const diffInMinutes = (now - latestUpdatedAt) / 60000;

        if (diffInMinutes > 5) {
            const updateQuery = `UPDATE cam SET status = 2`;
            connection.query(updateQuery, (err2) => {
                if (err2) {
                    const errorUpdateLog = connection.escape("Gagal update status cam ke 2: " + err2.message);
                    connection.query(`INSERT INTO logdata (keterangan,type) VALUES (${errorUpdateLog},2)`);
                    return console.error('Gagal update status cam ke 2:', err2);
                } else {
                    const successLog = connection.escape("Status semua CAM diupdate ke 2 karena tidak update lebih dari 5 menit.");
                    connection.query(`INSERT INTO logdata (keterangan,type) VALUES (${successLog},2)`);
                    console.log('Status semua CAM diupdate ke 2 karena tidak update lebih dari 5 menit.');
                }
            });
        } else {
            const activeLog = connection.escape("CAM masih aktif, tidak perlu update.");
            connection.query(`INSERT INTO logdata (keterangan,type) VALUES (${activeLog},2)`);
            console.log('CAM masih aktif, tidak perlu update.');
        }
    });
}


setInterval(checkAndUpdateCamStatus, 5 * 60 * 1000); // 5 menit


function checkAndUpdateIotStatus() {
    const query = `SELECT updated_at FROM iot ORDER BY updated_at DESC LIMIT 1`;

    connection.query(query, (err, results) => {
        if (err) {
            const errorLog = connection.escape("Gagal mengambil updated_at iot: " + err.message);
            connection.query(`INSERT INTO logdata (keterangan,type)  VALUES (${errorLog})`);
            return console.error('Gagal mengambil updated_at iot:', err);
        }

        if (results.length === 0) {
            const warningLog = connection.escape("Tidak ada data di tabel iot.");
            connection.query(`INSERT INTO logdata (keterangan,type)  VALUES (${warningLog})`);
            return console.warn('Tidak ada data di tabel iot.');
        }

        const latestUpdatedAt = new Date(results[0].updated_at);
        const now = new Date();
        const diffInMinutes = (now - latestUpdatedAt) / 60000;

        if (diffInMinutes > 5) {
            const updateQuery = `UPDATE iot SET status = 2`;
            connection.query(updateQuery, (err2) => {
                if (err2) {
                    const errorUpdateLog = connection.escape("Gagal update status iot ke 2: " + err2.message);
                    connection.query(`INSERT INTO logdata (keterangan,type)  VALUES (${errorUpdateLog},3)`);
                    return console.error('Gagal update status iot ke 2:', err2);
                } else {
                    const successLog = connection.escape("Status semua IOT diupdate ke 2 karena tidak update lebih dari 5 menit.");
                    connection.query(`INSERT INTO logdata (keterangan,type)  VALUES (${successLog},3)`);
                    console.log('Status semua IOT diupdate ke 2 karena tidak update lebih dari 5 menit.');
                }
            });
        } else {
            const activeLog = connection.escape("IOT masih aktif, tidak perlu update.");
            connection.query(`INSERT INTO logdata (keterangan,type)  VALUES (${activeLog},3)`);
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