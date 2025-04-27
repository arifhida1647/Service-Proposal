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