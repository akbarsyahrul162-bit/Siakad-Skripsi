const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

const prisma = new PrismaClient();

// 1 PINTU MASUK TERPADU (Username & Password: Dosen via sandi 'admin12345' / 'admin', Mahasiswa via NIM Whitelist)
router.post('/login-unified', async (req, res) => {
  try {
    const rawUser = req.body.username || req.body.nim || req.body.input || '';
    const rawPass = req.body.password || req.body.sandi || '';
    
    const cleanUser = String(rawUser).trim();
    const cleanPass = String(rawPass).trim();

    if (!cleanUser && !cleanPass) {
      return res.status(400).json({
        success: false,
        message: 'Silakan masukkan Username / NIM dan Kata Sandi.',
      });
    }

    // 1. PENENTU DOSEN / ADMIN:
    // Terdeteksi jika sandi = 'admin12345', atau jika username/password mengandung 'admin12345' / 'admin'
    const isDosenPassword = cleanPass === 'admin12345' || cleanPass.toLowerCase() === 'admin12345';
    const isDosenUser = cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'dosen' || cleanUser === 'admin12345';

    if (isDosenPassword || isDosenUser) {
      const admin = await prisma.admin.findFirst();
      const token = jwt.sign(
        {
          id: admin ? admin.id : 1,
          username: admin ? admin.username : 'admin',
          nama: admin ? admin.nama : 'Dr. Ir. Fitrah, M.T.',
          role: 'DOSEN',
        },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      });

      // Jika request dikirim langsung lewat form browser biasa (non-fetch/AJAX)
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return res.redirect('/admin.html');
      }

      return res.json({
        success: true,
        role: 'DOSEN',
        token: token,
        message: 'Akses Dosen / Admin Berhasil! Mengalihkan ke dashboard monitoring...',
        redirect: '/admin.html',
      });
    }

    // 2. PENENTU MAHASISWA:
    // Dilihat dari kolom NIM atau Username yang dimasukkan
    const rawNim = req.body.nim ? String(req.body.nim).trim() : '';
    const nimCandidate = rawNim || cleanUser || cleanPass;

    const mahasiswa = await prisma.mahasiswa.findUnique({
      where: { nim: nimCandidate },
    });

    if (!mahasiswa) {
      return res.status(403).json({
        success: false,
        isNotWhitelisted: true,
        message: 'NIM belum ditambahkan oleh admin',
      });
    }

    // Buat Token Sesi Mahasiswa
    const token = jwt.sign(
      {
        id: mahasiswa.id,
        nim: mahasiswa.nim,
        nama: mahasiswa.nama,
        angkatan: mahasiswa.angkatan,
        prodi: mahasiswa.prodi,
        role: 'MAHASISWA',
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Jika request dikirim langsung lewat form browser biasa (non-fetch/AJAX)
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/mahasiswa.html');
    }

    return res.json({
      success: true,
      role: 'MAHASISWA',
      token: token,
      message: `Selamat datang, ${mahasiswa.nama}! Mengalihkan ke dashboard...`,
      redirect: '/mahasiswa.html',
    });
  } catch (error) {
    console.error('Error login unified:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem server.' });
  }
});

// Login Mahasiswa (Whitelist NIM)
router.post('/login-mahasiswa', async (req, res) => {
  try {
    const { nim } = req.body;

    if (!nim || !String(nim).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Silakan masukkan NIM Anda.',
      });
    }

    const cleanNim = String(nim).trim();

    // Verifikasi Whitelist di Database
    const mahasiswa = await prisma.mahasiswa.findUnique({
      where: { nim: cleanNim },
    });

    if (!mahasiswa) {
      return res.status(403).json({
        success: false,
        isNotWhitelisted: true,
        message: 'NIM Anda belum didaftarkan oleh dosen/admin. Silakan hubungi admin untuk aktivasi data.',
      });
    }

    // Buat Token Sesi
    const token = jwt.sign(
      {
        id: mahasiswa.id,
        nim: mahasiswa.nim,
        nama: mahasiswa.nama,
        angkatan: mahasiswa.angkatan,
        prodi: mahasiswa.prodi,
        role: 'MAHASISWA',
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Simpan di HttpOnly Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: `Selamat datang, ${mahasiswa.nama}!`,
      user: {
        id: mahasiswa.id,
        nim: mahasiswa.nim,
        nama: mahasiswa.nama,
        angkatan: mahasiswa.angkatan,
        prodi: mahasiswa.prodi,
        role: 'MAHASISWA',
      },
      redirect: '/mahasiswa.html',
    });
  } catch (error) {
    console.error('Error login mahasiswa:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem server.' });
  }
});

// Login Dosen / Admin (Username & Password)
router.post('/login-dosen', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan Password wajib diisi.',
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { username: String(username).trim() },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password akun dosen salah.',
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password akun dosen salah.',
      });
    }

    // Buat Token Sesi
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        nama: admin.nama,
        role: admin.role,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: `Selamat datang, ${admin.nama}!`,
      user: {
        id: admin.id,
        username: admin.username,
        nama: admin.nama,
        role: admin.role,
      },
      redirect: '/admin.html',
    });
  } catch (error) {
    console.error('Error login dosen:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// Info Profil Sesi Aktif
router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Berhasil keluar.' });
});

module.exports = router;
