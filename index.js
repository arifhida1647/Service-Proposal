const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createCanvas, loadImage } = require("@napi-rs/canvas");

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

// Fungsi untuk download file dari URL dan menyimpannya di server
const downloadImage = async (url, outputPath) => {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

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

app.post("/upload-roboflow", upload.single("image"), async (req, res) => {
    const imageFilePath = req.file.path;

    // Convert the uploaded image to base64
    const imageBase64 = fs.readFileSync(imageFilePath, {
        encoding: "base64"
    });

    // Send the image to Roboflow API
    try {
        const response = await axios({
            method: "POST",
            url: "https://detect.roboflow.com/parking-detection-jeremykevin/8",
            params: {
                api_key: "LreU9tXt88hlHt6pxe7X"
            },
            data: imageBase64,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        // Get the resulting image from the Roboflow API response
        const resultImage = response.data;

        // Load the original image
        const originalImage = await loadImage(imageFilePath);

        // Create a canvas to draw on
        const canvas = createCanvas(originalImage.width, originalImage.height);
        const ctx = canvas.getContext("2d");

        // Draw the original image on the canvas
        ctx.drawImage(originalImage, 0, 0);

        // Draw bounding boxes from predictions
        const offsetY = 110; // Adjust this value to move the box up further or lower
        const offsetX = 70;
        resultImage.predictions.forEach(prediction => {
            // Set the color based on the class_id
            if (prediction.class_id > 0) {
                ctx.strokeStyle = "green"; // Green for class_id > 0
            } else {
                ctx.strokeStyle = "red"; // Red for class_id == 0
            }

            ctx.lineWidth = 2;
            ctx.strokeRect(
                prediction.x - offsetX,
                prediction.y - offsetY,
                prediction.width,
                prediction.height
            );
        });

        // Create a buffer from the canvas
        const imageBuffer = canvas.toBuffer("image/jpeg");

        // Save the resulting image to the /storage folder
        const fileName = `result-${Date.now()}.jpg`;
        const outputFilePath = path.join(__dirname, 'storage', fileName);
        fs.writeFileSync(outputFilePath, imageBuffer);

        // Insert the file information into the database
        const query = 'INSERT INTO image (path_image) VALUES (?)';
        connection.query(query, [fileName], (err, results) => {
            if (err) {
                console.error('Error inserting file info into database:', err.stack);
                // Clean up the uploaded file
                fs.unlinkSync(imageFilePath);
                return res.status(500).json({
                    message: 'An error occurred while saving file info to database',
                    error: err.message
                });
            }

            // Respond with the Roboflow API response data
            res.status(200).json({
                message: 'Image processed successfully',
                predictions: resultImage.predictions
            });

            // Clean up the uploaded file
            fs.unlinkSync(imageFilePath);
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send("Error processing image");

        // Clean up the uploaded file
        fs.unlinkSync(imageFilePath);
    }
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
app.post('/update-status-iot-s3', (req, res) => {
    const { statusArray } = req.body;

    // Validasi panjang array
    if (!Array.isArray(statusArray) || statusArray.length !== 17) {
        return res.status(400).json({ error: 'Array harus memiliki panjang 17.' });
    }

    // Validasi isi array hanya boleh 1 dan 0
    // Validasi isi array hanya boleh 1 dan 0
    for (let i = 0; i < statusArray.length; i++) {
        if (statusArray[i] !== 1 && statusArray[i] !== 0 && statusArray[i] !== 2) {
            return res.status(400).json({ error: 'Array tidak sesuai.' });
        }
    }

    // Update status secara berurutan berdasarkan id
    const updatePromises = statusArray.map((status, index) => {
        const id = index + 1; // Misalkan id mulai dari 1 sampai 17
        return new Promise((resolve, reject) => {
            const query = 'UPDATE iot SET status = ? WHERE id = ?';
            connection.query(query, [status, id], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    });

    // Eksekusi semua update
    Promise.all(updatePromises)
        .then(() => {
            res.status(200).json({ message: 'Status berhasil diperbarui.' });
        })
        .catch((error) => {
            console.error('Error updating status:', error);
            res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui status.' });
        });
});

// Endpoint untuk memperbarui status
app.post('/update-status-iot-s1', (req, res) => {
    const { statusArray } = req.body;

    // Validasi panjang array
    if (!Array.isArray(statusArray) || statusArray.length !== 3) {
        return res.status(400).json({ error: 'Array harus memiliki panjang 3.' });
    }

    // Validasi isi array hanya boleh 1 dan 0
    for (let i = 0; i < statusArray.length; i++) {
        if (statusArray[i] !== 1 && statusArray[i] !== 0 && statusArray[i] !== 2) {
            return res.status(400).json({ error: 'Array tidak sesuai.' });
        }
    }

    // Update status secara berurutan berdasarkan id mulai dari 18
    const updatePromises = statusArray.map((status, index) => {
        const id = index + 18; // ID mulai dari 18 sampai 20
        return new Promise((resolve, reject) => {
            const query = 'UPDATE iot SET status = ? WHERE id = ?';
            connection.query(query, [status, id], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    });

    // Eksekusi semua update
    Promise.all(updatePromises)
        .then(() => {
            res.status(200).json({ message: 'Status berhasil diperbarui.' });
        })
        .catch((error) => {
            console.error('Error updating status:', error);
            res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui status.' });
        });
});



// Mulai server// Contoh endpoint
app.get("/", (req, res) => {
    res.send("Hello from Express on Vercel!");
});

app.listen(port, () => console.log(`Listening to port ${port} (http://localhost:${port})`));