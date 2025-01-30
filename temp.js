const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 3001;
const fs = require('fs');

// Konfigurasi database
const connection = mysql.createConnection({
    host: 'service.arifhida.my.id',
    port: 3306,
    user: 'wosazfnd_root',
    password: 'a7j7Y1l3aZ]+',
    database: 'wosazfnd_parkingsistem'
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


// Konfigurasi multer untuk penyimpanan file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'storage/'); // Folder tujuan penyimpanan
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = path.basename(file.originalname, ext) + '-' + Date.now() + ext;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

// Endpoint untuk menghapus semua file dan informasi dari database
app.delete('/delete-all', (req, res) => {
    // Ambil semua nama file dari database
    const querySelect = 'SELECT path_image FROM image';
    connection.query(querySelect, (err, results) => {
        if (err) {
            console.error('Error fetching file names from database:', err.stack);
            return res.status(500).json({
                message: 'An error occurred while fetching file names from database',
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                message: 'No files found in the database'
            });
        }

        // Hapus semua file dari sistem file
        const files = results.map(row => row.path_image);
        const deleteFilesPromises = files.map(file => {
            const filePath = path.join(__dirname, 'storage', file);
            return new Promise((resolve, reject) => {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting file from system:', err.stack);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });

        // Hapus semua file informasi dari database
        const queryDelete = 'DELETE FROM image';
        connection.query(queryDelete, (err) => {
            if (err) {
                console.error('Error deleting file info from database:', err.stack);
                return res.status(500).json({
                    message: 'An error occurred while deleting file info from database',
                    error: err.message
                });
            }
        });

        // Tunggu hingga semua file terhapus
        Promise.all(deleteFilesPromises)
            .then(() => {
                res.json({
                    message: 'All files deleted successfully'
                });
            })
            .catch(err => {
                res.status(500).json({
                    message: 'An error occurred while deleting some files',
                    error: err.message
                });
            });
    });
});

// Endpoint untuk menghapus file berdasarkan nama file
app.delete('/delete/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'storage', filename);

    // Hapus file dari sistem file
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('Error deleting file from system:', err.stack);
            return res.status(500).json({
                message: 'An error occurred while deleting the file',
                error: err.message
            });
        }

        // Hapus informasi file dari database
        const query = 'DELETE FROM image WHERE path_image = ?';
        connection.query(query, [filename], (err, results) => {
            if (err) {
                console.error('Error deleting file info from database:', err.stack);
                return res.status(500).json({
                    message: 'An error occurred while deleting file info from database',
                    error: err.message
                });
            }

            if (results.affectedRows > 0) {
                return res.json({
                    message: 'File deleted successfully'
                });
            } else {
                return res.status(404).json({
                    message: 'File not found in database'
                });
            }
        });
    });
});

// Endpoint untuk mengupload gambar
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            message: 'No file uploaded'
        });
    }

    // Ambil nama file lengkap
    const fileName = req.file.filename;

    console.log('Full file name:', fileName); // Log nama file untuk debugging

    // Simpan nama file ke tabel image
    const query = 'INSERT INTO image (path_image) VALUES (?)';
    connection.query(query, [fileName], (err, results) => {
        if (err) {
            console.error('Error inserting file info into database:', err.stack);
            return res.status(500).json({
                message: 'An error occurred while saving file info to database',
                error: err.message
            });
        }

        res.json({
            message: 'File uploaded and info saved to database successfully',
            file: {
                name: fileName
            }
        });
    });
});

// Endpoint untuk mengambil data dari tabel "iot"
app.get('/iot/:id', (req, res) => {
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

app.get('/cam/:id', (req, res) => {
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

// Mulai server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
