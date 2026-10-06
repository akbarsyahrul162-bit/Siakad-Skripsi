const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const PORTAL_CONFIG = require('../config/portals');

const prisma = new PrismaClient();

// Semua rute ini hanya untuk akun MAHASISWA
router.use(requireAuth);
router.use(requireRole('MAHASISWA'));

// Ambil konfigurasi portal & data submission milik mahasiswa yang login
router.get('/portal-data', async (req, res) => {
  try {
    const mahasiswaId = req.user.id;

    // Ambil data mahasiswa terbaru
    const mahasiswa = await prisma.mahasiswa.findUnique({
      where: { id: mahasiswaId },
      include: { submissions: true },
    });

    if (!mahasiswa) {
      return res.status(404).json({ success: false, message: 'Data mahasiswa tidak ditemukan.' });
    }

    // Map submission by portal key
    const submissionMap = {};
    mahasiswa.submissions.forEach((sub) => {
      submissionMap[sub.portal] = sub;
    });

    const portals = Object.keys(PORTAL_CONFIG).map((key) => {
      const cfg = PORTAL_CONFIG[key];
      const sub = submissionMap[key] || {
        status: 'EMPTY',
        driveUrl: '',
        catatanDosen: null,
        verifiedBy: null,
        verifiedAt: null,
      };

      return {
        ...cfg,
        submission: sub,
      };
    });

    return res.json({
      success: true,
      mahasiswa: {
        id: mahasiswa.id,
        nim: mahasiswa.nim,
        nama: mahasiswa.nama,
        angkatan: mahasiswa.angkatan,
        prodi: mahasiswa.prodi,
        judulSkripsi: mahasiswa.judulSkripsi,
      },
      portals,
    });
  } catch (error) {
    console.error('Error get portal data:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data portal.' });
  }
});

// Simpan atau perbarui tautan Google Drive
router.post('/submit', async (req, res) => {
  try {
    const mahasiswaId = req.user.id;
    const { portal, driveUrl } = req.body;

    if (!portal || !PORTAL_CONFIG[portal]) {
      return res.status(400).json({ success: false, message: 'Portal tidak valid.' });
    }

    if (!driveUrl || !String(driveUrl).trim()) {
      return res.status(400).json({ success: false, message: 'Tautan Google Drive tidak boleh kosong.' });
    }

    const cleanUrl = String(driveUrl).trim();

    // Validasi URL sederhana
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, message: 'Tautan harus diawali dengan http:// atau https://' });
    }

    // Upsert data submission dengan status PENDING
    const submission = await prisma.submission.upsert({
      where: {
        mahasiswaId_portal: {
          mahasiswaId,
          portal,
        },
      },
      update: {
        driveUrl: cleanUrl,
        status: 'PENDING',
        updatedAt: new Date(),
      },
      create: {
        mahasiswaId,
        portal,
        driveUrl: cleanUrl,
        status: 'PENDING',
      },
      include: {
        mahasiswa: true,
      },
    });

    // Real-time broadcast ke dosen melalui Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('submission_updated', {
        mahasiswaId: submission.mahasiswaId,
        nim: submission.mahasiswa.nim,
        nama: submission.mahasiswa.nama,
        angkatan: submission.mahasiswa.angkatan,
        portal: submission.portal,
        status: submission.status,
        driveUrl: submission.driveUrl,
        updatedAt: submission.updatedAt,
      });
    }

    return res.json({
      success: true,
      message: 'Tautan berkas berhasil dikirim! Menunggu pemeriksaan dari dosen.',
      submission,
    });
  } catch (error) {
    console.error('Error submit drive url:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan tautan berkas.' });
  }
});

module.exports = router;
