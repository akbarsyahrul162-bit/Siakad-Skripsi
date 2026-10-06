require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const mahasiswaRoutes = require('./routes/mahasiswa');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// Inisialisasi Socket.io untuk sinkronisasi Real-Time
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

// 1. Lapisan Keamanan Helmet dengan CSP fleksibel untuk Google Drive iframe & Google Fonts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: [
          "'self'",
          'https://drive.google.com',
          'https://docs.google.com',
          'https://*.google.com',
        ],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Parser & Cookie
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. Lapisan Keamanan Anti-Brute Force (Rate Limiting)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 20, // Maksimal 20 percobaan login per IP
  message: {
    success: false,
    message: 'Terlalu banyak percobaan login yang gagal. Akses ditahan sementara selama 15 menit demi keamanan.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login-dosen', loginLimiter);

// 4. File Statis Frontend
app.use(express.static(path.join(__dirname, '../public')));

// 5. Rute API
app.use('/api/auth', authRoutes);
app.use('/api/mahasiswa', mahasiswaRoutes);
app.use('/api/admin', adminRoutes);

// 6. Socket.io Event Handler
io.on('connection', (socket) => {
  // console.log('Koneksi real-time tersambung:', socket.id);

  socket.on('disconnect', () => {
    // console.log('Koneksi real-time terputus:', socket.id);
  });
});

// Fallback untuk SPA / Halaman awal
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Port Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎓 PORTAL AKADEMIK SIAKAD - SISTEM SKRIPSI AKTIF`);
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`🛡️  Keamanan: Helmet + Rate Limiter + Anti-SQL Injection + Whitelist`);
  console.log(`⚡ Real-Time Sync: Aktif via Socket.io`);
  console.log(`====================================================`);
});
