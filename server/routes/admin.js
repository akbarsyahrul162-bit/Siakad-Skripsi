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

    const portalKeys = Object.keys(PORTAL_CONFIG);

    const data = mahasiswaList.map((mhs) => {
      const subMap = {};
      mhs.submissions.forEach((s) => {
        subMap[s.portal] = s;
      });

      const portals = {};
      portalKeys.forEach((k) => {
        portals[k] = subMap[k] || { status: 'EMPTY', driveUrl: null };
      });

      return {
        id: mhs.id,
        nim: mhs.nim,
        nama: mhs.nama,
        angkatan: mhs.angkatan,
        prodi: mhs.prodi,
        judulSkripsi: mhs.judulSkripsi,
        createdAt: mhs.createdAt,
        portals,
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
      portalsConfig: PORTAL_CONFIG,
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

// Edit / Update data mahasiswa di whitelist
router.put('/mahasiswa/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nim, nama, angkatan, prodi, judulSkripsi } = req.body;

    if (!nim || !nama || !angkatan) {
      return res.status(400).json({
        success: false,
        message: 'NIM, Nama, dan Angkatan wajib diisi.',
      });
    }

    const cleanNim = String(nim).trim();

    // Cek jika NIM diganti dan sudah dipakai mahasiswa lain
    const duplicate = await prisma.mahasiswa.findFirst({
      where: {
        nim: cleanNim,
        NOT: { id },
      },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `NIM ${cleanNim} sudah digunakan oleh mahasiswa lain.`,
      });
    }

    const updatedMhs = await prisma.mahasiswa.update({
      where: { id },
      data: {
        nim: cleanNim,
        nama: String(nama).trim(),
        angkatan: String(angkatan).trim(),
        prodi: prodi ? String(prodi).trim() : 'Teknik Informatika',
        judulSkripsi: judulSkripsi ? String(judulSkripsi).trim() : null,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('whitelist_updated', { action: 'UPDATED', mahasiswa: updatedMhs });
    }

    return res.json({
      success: true,
      message: `Data mahasiswa ${updatedMhs.nama} berhasil diperbarui!`,
      mahasiswa: updatedMhs,
    });
  } catch (error) {
    console.error('Error update mahasiswa:', error);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui data mahasiswa.' });
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

    if (!['APPROVED', 'REVISION', 'PENDING', 'EMPTY'].includes(status)) {
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

// Ambil data konfigurasi persyaratan berkas portal
router.get('/portals-config', (req, res) => {
  return res.json({
    success: true,
    portals: PORTAL_CONFIG,
  });
});

// Update persyaratan berkas untuk portal tertentu
router.put('/portals-config/:portalKey', (req, res) => {
  try {
    const { portalKey } = req.params;
    const { nama, deskripsi, berkas } = req.body;

    if (!PORTAL_CONFIG[portalKey]) {
      return res.status(404).json({ success: false, message: 'Portal tidak ditemukan.' });
    }

    if (nama) PORTAL_CONFIG[portalKey].nama = String(nama).trim();
    if (deskripsi) PORTAL_CONFIG[portalKey].deskripsi = String(deskripsi).trim();
    if (Array.isArray(berkas)) {
      PORTAL_CONFIG[portalKey].berkas = berkas.map((b, idx) => ({
        nomor: idx + 1,
        nama: String(b.nama || '').trim(),
        keterangan: String(b.keterangan || '').trim(),
        formatContoh: String(b.formatContoh || `0${idx + 1}_Dokumen_[NIM].pdf`).trim(),
      }));
    }

    // Broadcast ke mahasiswa & admin jika ada socket
    const io = req.app.get('io');
    if (io) {
      io.emit('portals_config_updated', { portals: PORTAL_CONFIG, portalKey, portal: PORTAL_CONFIG[portalKey] });
    }

    return res.json({
      success: true,
      message: `Persyaratan berkas ${PORTAL_CONFIG[portalKey].nama} berhasil diperbarui!`,
      portal: PORTAL_CONFIG[portalKey],
      portals: PORTAL_CONFIG,
    });
  } catch (error) {
    console.error('Error update portal config:', error);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui persyaratan portal.' });
  }
});

// Tambah Portal Baru
router.post('/portals-config', (req, res) => {
  try {
    const { nama, deskripsi, berkas } = req.body;

    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: 'Nama portal wajib diisi.' });
    }

    // Generate portal key baru yang unik
    const existingKeys = Object.keys(PORTAL_CONFIG);
    let nextIndex = existingKeys.length + 1;
    let newKey = `PORTAL_${nextIndex}`;
    while (PORTAL_CONFIG[newKey]) {
      nextIndex++;
      newKey = `PORTAL_${nextIndex}`;
    }

    const cleanNama = String(nama).trim();
    const cleanDeskripsi = deskripsi ? String(deskripsi).trim() : 'Persyaratan berkas tahapan skripsi.';

    const initialDocs = Array.isArray(berkas) && berkas.length > 0
      ? berkas.map((b, idx) => ({
          nomor: idx + 1,
          nama: String(b.nama || '').trim(),
          keterangan: String(b.keterangan || '').trim(),
          formatContoh: String(b.formatContoh || `0${idx + 1}_Dokumen_[NIM].pdf`).trim(),
        }))
      : [
          {
            nomor: 1,
            nama: 'Dokumen Persyaratan Utama',
            keterangan: 'Lembar / surat pengesahan yang telah disetujui',
            formatContoh: `01_Dokumen_Persyaratan_[NIM].pdf`,
          },
        ];

    PORTAL_CONFIG[newKey] = {
      id: newKey,
      nama: cleanNama,
      deskripsi: cleanDeskripsi,
      berkas: initialDocs,
    };

    // Broadcast update portal ke semua client
    const io = req.app.get('io');
    if (io) {
      io.emit('portals_config_updated', { portals: PORTAL_CONFIG, newKey });
    }

    return res.json({
      success: true,
      message: `Portal baru "${cleanNama}" berhasil ditambahkan!`,
      portalKey: newKey,
      portal: PORTAL_CONFIG[newKey],
      portals: PORTAL_CONFIG,
    });
  } catch (error) {
    console.error('Error create portal config:', error);
    return res.status(500).json({ success: false, message: 'Gagal menambahkan portal baru.' });
  }
});

// Hapus Portal
router.delete('/portals-config/:portalKey', (req, res) => {
  try {
    const { portalKey } = req.params;

    if (!PORTAL_CONFIG[portalKey]) {
      return res.status(404).json({ success: false, message: 'Portal tidak ditemukan.' });
    }

    const deletedNama = PORTAL_CONFIG[portalKey].nama;
    delete PORTAL_CONFIG[portalKey];

    // Broadcast ke semua client
    const io = req.app.get('io');
    if (io) {
      io.emit('portals_config_updated', { portals: PORTAL_CONFIG, deletedKey: portalKey });
    }

    return res.json({
      success: true,
      message: `Portal "${deletedNama}" berhasil dihapus.`,
      portals: PORTAL_CONFIG,
    });
  } catch (error) {
    console.error('Error delete portal config:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus portal.' });
  }
});

module.exports = router;
