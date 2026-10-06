const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const PORTAL_CONFIG = require('../config/portals');

const prisma = new PrismaClient();

// Semua rute ini hanya untuk akun DOSEN / ADMIN
router.use(requireAuth);
router.use(requireRole(['DOSEN', 'ADMIN']));

// Ambil daftar seluruh mahasiswa bimbingan & status pengumpulan
router.get('/mahasiswa', async (req, res) => {
  try {
    const mahasiswaList = await prisma.mahasiswa.findMany({
      include: {
        submissions: true,
      },
      orderBy: {
        nim: 'asc',
      },
    });

    const data = mahasiswaList.map((mhs) => {
      const subMap = {};
      mhs.submissions.forEach((s) => {
        subMap[s.portal] = s;
      });

      return {
        id: mhs.id,
        nim: mhs.nim,
        nama: mhs.nama,
        angkatan: mhs.angkatan,
        prodi: mhs.prodi,
        judulSkripsi: mhs.judulSkripsi,
        createdAt: mhs.createdAt,
        portals: {
          PORTAL_1: subMap.PORTAL_1 || { status: 'EMPTY', driveUrl: null },
          PORTAL_2: subMap.PORTAL_2 || { status: 'EMPTY', driveUrl: null },
          PORTAL_3: subMap.PORTAL_3 || { status: 'EMPTY', driveUrl: null },
        },
      };
    });

    // Statistik ringkas
    let pendingCount = 0;
    mahasiswaList.forEach((m) => {
      m.submissions.forEach((s) => {
        if (s.status === 'PENDING') pendingCount++;
      });
    });

    return res.json({
      success: true,
      totalMahasiswa: mahasiswaList.length,
      pendingCount,
      mahasiswa: data,
    });
  } catch (error) {
    console.error('Error get all mahasiswa:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data mahasiswa.' });
  }
});

// Tambah mahasiswa baru ke Whitelist (langsung aktif login)
router.post('/mahasiswa', async (req, res) => {
  try {
    const { nim, nama, angkatan, prodi, judulSkripsi } = req.body;

    if (!nim || !nama || !angkatan) {
      return res.status(400).json({
        success: false,
        message: 'NIM, Nama Lengkap, dan Angkatan wajib diisi.',
      });
    }

    const cleanNim = String(nim).trim();

    // Cek duplikasi NIM
    const existing = await prisma.mahasiswa.findUnique({
      where: { nim: cleanNim },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Mahasiswa dengan NIM ${cleanNim} sudah terdaftar di sistem.`,
      });
    }

    const newMhs = await prisma.mahasiswa.create({
      data: {
        nim: cleanNim,
        nama: String(nama).trim(),
        angkatan: String(angkatan).trim(),
        prodi: prodi ? String(prodi).trim() : 'Teknik Informatika',
        judulSkripsi: judulSkripsi ? String(judulSkripsi).trim() : null,
      },
    });

    // Broadcast update whitelist
    const io = req.app.get('io');
    if (io) {
      io.emit('whitelist_updated', { action: 'ADDED', mahasiswa: newMhs });
    }

    return res.json({
      success: true,
      message: `Mahasiswa ${newMhs.nama} (${newMhs.nim}) berhasil didaftarkan ke whitelist!`,
      mahasiswa: newMhs,
    });
  } catch (error) {
    console.error('Error create mahasiswa:', error);
    return res.status(500).json({ success: false, message: 'Gagal menambahkan mahasiswa ke whitelist.' });
  }
});

// Hapus mahasiswa dari whitelist
router.delete('/mahasiswa/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mhs = await prisma.mahasiswa.findUnique({ where: { id } });

    if (!mhs) {
      return res.status(404).json({ success: false, message: 'Data mahasiswa tidak ditemukan.' });
    }

    await prisma.mahasiswa.delete({ where: { id } });

    const io = req.app.get('io');
    if (io) {
      io.emit('whitelist_updated', { action: 'DELETED', id });
    }

    return res.json({
      success: true,
      message: `Mahasiswa ${mhs.nama} (${mhs.nim}) telah dihapus dari whitelist.`,
    });
  } catch (error) {
    console.error('Error delete mahasiswa:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus mahasiswa.' });
  }
});

// Detail berkas mahasiswa tertentu untuk modal verifikasi
router.get('/mahasiswa/:id/berkas', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mhs = await prisma.mahasiswa.findUnique({
      where: { id },
      include: { submissions: true },
    });

    if (!mhs) {
      return res.status(404).json({ success: false, message: 'Mahasiswa tidak ditemukan.' });
    }

    const subMap = {};
    mhs.submissions.forEach((s) => {
      subMap[s.portal] = s;
    });

    const portals = Object.keys(PORTAL_CONFIG).map((key) => {
      const cfg = PORTAL_CONFIG[key];
      const sub = subMap[key] || {
        status: 'EMPTY',
        driveUrl: '',
        catatanDosen: null,
      };

      return {
        ...cfg,
        submission: sub,
      };
    });

    return res.json({
      success: true,
      mahasiswa: {
        id: mhs.id,
        nim: mhs.nim,
        nama: mhs.nama,
        angkatan: mhs.angkatan,
        prodi: mhs.prodi,
        judulSkripsi: mhs.judulSkripsi,
      },
      portals,
    });
  } catch (error) {
    console.error('Error get berkas detail:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil detail berkas.' });
  }
});

// Verifikasi Berkas (ACC / Revisi)
router.post('/verify', async (req, res) => {
  try {
    const { mahasiswaId, portal, status, catatanDosen } = req.body;

    if (!mahasiswaId || !portal || !status) {
      return res.status(400).json({ success: false, message: 'Data verifikasi tidak lengkap.' });
    }

    if (!['APPROVED', 'REVISION', 'PENDING'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status verifikasi tidak valid.' });
    }

    const updated = await prisma.submission.upsert({
      where: {
        mahasiswaId_portal: {
          mahasiswaId: parseInt(mahasiswaId, 10),
          portal,
        },
      },
      update: {
        status,
        catatanDosen: catatanDosen ? String(catatanDosen).trim() : null,
        verifiedBy: req.user.nama,
        verifiedAt: new Date(),
      },
      create: {
        mahasiswaId: parseInt(mahasiswaId, 10),
        portal,
        status,
        catatanDosen: catatanDosen ? String(catatanDosen).trim() : null,
        verifiedBy: req.user.nama,
        verifiedAt: new Date(),
      },
      include: {
        mahasiswa: true,
      },
    });

    // Real-time broadcast ke mahasiswa dan dosen lainnya
    const io = req.app.get('io');
    if (io) {
      io.emit('status_verified', {
        mahasiswaId: updated.mahasiswaId,
        nim: updated.mahasiswa.nim,
        nama: updated.mahasiswa.nama,
        portal: updated.portal,
        status: updated.status,
        catatanDosen: updated.catatanDosen,
        verifiedBy: updated.verifiedBy,
        verifiedAt: updated.verifiedAt,
      });
    }

    return res.json({
      success: true,
      message: `Status berkas ${portal} berhasil diperbarui menjadi ${status}!`,
      submission: updated,
    });
  } catch (error) {
    console.error('Error verify submission:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan hasil verifikasi.' });
  }
});

module.exports = router;
