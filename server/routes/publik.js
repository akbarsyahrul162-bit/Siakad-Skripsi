const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const PORTAL_CONFIG = require("../config/portals");
const prisma = new PrismaClient();

router.get("/siteconfig", async (req, res) => {
  try {
    const configs = await prisma.siteConfig.findMany();
    const result = {};
    configs.forEach((c) => { result[c.key] = c.value; });
    const defaults = {
      beranda_title: "Portal Akademik & Monitoring Skripsi",
      beranda_subtitle: "Sistem pemantauan progres skripsi mahasiswa bimbingan secara real-time.",
      beranda_header_chip: "Tahun Akademik 2024/2025",
      beranda_footer: "2026 Portal Akademik Sistem Informasi Skripsi",
      login_judul: "Sistem Pengumpulan & Verifikasi Berkas Skripsi",
      login_deskripsi: "Portal akademik terpadu untuk pengumpulan dan verifikasi berkas Seminar Proposal, Seminar Hasil, dan Ujian Meja / Skripsi.",
      login_petunjuk_admin: "",
      login_petunjuk_mhs: "Masukkan nama lengkap NIM Anda",
      helpdesk_info: "Butuh aktivasi NIM? Hubungi Helpdesk Akademik.",
    };
    Object.keys(defaults).forEach((k) => { if (!(k in result)) result[k] = defaults[k]; });
    return res.json({ success: true, config: result });
  } catch (error) {
    console.error("Error get siteconfig:", error);
    return res.status(500).json({ success: false, message: "Gagal memuat konfigurasi situs." });
  }
});

async function getActivePortalConfig() {
  try {
    const configRow = await prisma.siteConfig.findUnique({
      where: { key: 'portals_config_json' },
    });
    if (configRow && configRow.value) {
      return JSON.parse(configRow.value);
    }
  } catch (err) {
    console.error('Error load portal config from DB:', err);
  }
  return PORTAL_CONFIG;
}

router.get("/mahasiswa", async (req, res) => {
  try {
    const activePortals = await getActivePortalConfig();
    const portalKeys = Object.keys(activePortals);

    const mahasiswaList = await prisma.mahasiswa.findMany({
      include: {
        submissions: true,
        jadwal: { where: { status: "TERJADWAL" }, orderBy: { tanggal: "asc" }, take: 1 },
      },
      orderBy: { nim: "asc" },
    });

    const data = mahasiswaList.map((mhs) => {
      const subMap = {};
      mhs.submissions.forEach((s) => { subMap[s.portal] = s; });
      const approvedCount = Object.values(subMap).filter((s) => s.status === "APPROVED").length;
      let statusRingkas = "Baru Terdaftar";
      
      // Hitung status kelulusan berdasarkan tahapan aktif terakhir yang approved
      for (let i = portalKeys.length - 1; i >= 0; i--) {
        const pk = portalKeys[i];
        if (subMap[pk] && subMap[pk].status === "APPROVED") {
          let pName = activePortals[pk] ? activePortals[pk].nama : pk;
          if (pName.includes(':')) pName = pName.split(':')[1].trim();
          statusRingkas = pName.toLowerCase().startsWith('lulus') ? pName : `Lulus ${pName}`;
          break;
        }
      }

      if (statusRingkas === "Baru Terdaftar") {
        if (Object.values(subMap).some((s) => s.status === "REVISION")) statusRingkas = "Dalam Revisi";
        else if (Object.values(subMap).some((s) => s.status === "PENDING")) statusRingkas = "Menunggu Verifikasi";
      }

      const jadwalTerdekat = mhs.jadwal && mhs.jadwal[0] ? mhs.jadwal[0] : null;
      return {
        id: mhs.id, nim: mhs.nim, nama: mhs.nama, angkatan: mhs.angkatan,
        prodi: mhs.prodi, judulSkripsi: mhs.judulSkripsi, statusRingkas,
        fotoProfil: mhs.fotoProfil,
        approvedCount, totalPortal: portalKeys.length,
        jadwalTerdekat: jadwalTerdekat ? { jenis: jadwalTerdekat.jenis, tanggal: jadwalTerdekat.tanggal, jam: jadwalTerdekat.jam, ruangan: jadwalTerdekat.ruangan } : null,
      };
    });

    const colorPresets = [
      { color: '#0284c7', bg: '#e0f2fe', icon: 'fa-solid fa-file-circle-check' },
      { color: '#d97706', bg: '#fef3c7', icon: 'fa-solid fa-clipboard-check' },
      { color: '#059669', bg: '#d1fae5', icon: 'fa-solid fa-award' },
      { color: '#7c3aed', bg: '#ede9fe', icon: 'fa-solid fa-graduation-cap' },
      { color: '#db2777', bg: '#fce7f3', icon: 'fa-solid fa-medal' },
      { color: '#2563eb', bg: '#dbeafe', icon: 'fa-solid fa-certificate' },
    ];

    const stageCards = portalKeys.map((key, idx) => {
      const p = activePortals[key];
      let label = p && p.nama ? p.nama : key;
      if (label.includes(':')) label = label.split(':')[1].trim();
      if (!label.toLowerCase().startsWith('lulus') && !label.toLowerCase().startsWith('tahap')) {
        label = 'Lulus ' + label;
      }
      const count = mahasiswaList.filter(m => m.submissions.some(s => s.portal === key && s.status === 'APPROVED')).length;
      const preset = colorPresets[idx % colorPresets.length];
      return {
        key,
        title: p ? p.nama : key,
        label,
        count,
        color: preset.color,
        bg: preset.bg,
        icon: preset.icon,
      };
    });

    const stats = {
      totalMahasiswa: mahasiswaList.length,
      stageCards,
      lulusSempro: stageCards[0] ? stageCards[0].count : 0,
      lulusSemhas: stageCards[1] ? stageCards[1].count : 0,
      lulusSkripsi: stageCards[2] ? stageCards[2].count : 0,
      dalamRevisi: data.filter((d) => d.statusRingkas === "Dalam Revisi").length,
      menungguVerifikasi: data.filter((d) => d.statusRingkas === "Menunggu Verifikasi").length,
    };
    return res.json({ success: true, mahasiswa: data, stats, portals: activePortals });
  } catch (error) {
    console.error("Error get publik mahasiswa:", error);
    return res.status(500).json({ success: false, message: "Gagal memuat data mahasiswa." });
  }
});

async function getPublicJadwalTypes() {
  const DEFAULT_TYPES = [
    { id: 'SEMPRO', nama: 'Seminar Proposal (Sempro)', badgeColor: '#0369a1', badgeBg: '#e0f2fe' },
    { id: 'SEMHAS', nama: 'Seminar Hasil (Semhas)', badgeColor: '#b45309', badgeBg: '#fef3c7' },
    { id: 'SIDANG', nama: 'Sidang Skripsi / Ujian Tutup', badgeColor: '#15803d', badgeBg: '#dcfce7' },
    { id: 'WISUDA', nama: 'Wisuda Sarjana & Yudisium', badgeColor: '#7e22ce', badgeBg: '#f3e8ff' },
  ];
  try {
    const cfg = await prisma.siteConfig.findUnique({ where: { key: 'JADWAL_TYPES' } });
    if (cfg && cfg.value) {
      const parsed = JSON.parse(cfg.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return DEFAULT_TYPES;
}

router.get("/jadwal/types", async (req, res) => {
  try {
    const types = await getPublicJadwalTypes();
    return res.json({ success: true, types });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Gagal mengambil opsi jadwal." });
  }
});

router.get("/jadwal", async (req, res) => {
  try {
    const [jadwalList, types] = await Promise.all([
      prisma.jadwalUjian.findMany({
        where: { status: "TERJADWAL", tanggal: { gte: new Date(new Date().setHours(0,0,0,0)) } },
        include: { mahasiswa: { select: { id: true, nim: true, nama: true, prodi: true, angkatan: true } } },
        orderBy: { tanggal: "asc" },
        take: 25,
      }),
      getPublicJadwalTypes(),
    ]);

    return res.json({ success: true, jadwal: jadwalList, types });
  } catch (error) {
    console.error("Error get jadwal publik:", error);
    return res.status(500).json({ success: false, message: "Gagal memuat jadwal ujian." });
  }
});

// ⚡ HIGH-SPEED BOOTSTRAP ENDPOINT (1 Single HTTP Request for Entire Public Home)
router.get("/bootstrap", async (req, res) => {
  try {
    const [configs, activePortals, types, mahasiswaList, jadwalList] = await Promise.all([
      prisma.siteConfig.findMany(),
      getActivePortalConfig(),
      getPublicJadwalTypes(),
      prisma.mahasiswa.findMany({
        include: {
          submissions: true,
          jadwal: { where: { status: "TERJADWAL" }, orderBy: { tanggal: "asc" }, take: 1 },
        },
        orderBy: { nim: "asc" },
      }),
      prisma.jadwalUjian.findMany({
        where: { status: "TERJADWAL", tanggal: { gte: new Date(new Date().setHours(0,0,0,0)) } },
        include: { mahasiswa: { select: { id: true, nim: true, nama: true, prodi: true, angkatan: true } } },
        orderBy: { tanggal: "asc" },
        take: 25,
      }),
    ]);

    // Format configs
    const cfgResult = {};
    configs.forEach((c) => { cfgResult[c.key] = c.value; });
    const defaults = {
      beranda_title: "Portal Akademik & Monitoring Skripsi",
      beranda_subtitle: "Sistem pemantauan progres skripsi mahasiswa bimbingan secara real-time.",
      beranda_header_chip: "Tahun Akademik 2024/2025",
      beranda_footer: "2026 Portal Akademik Sistem Informasi Skripsi",
      login_judul: "Sistem Pengumpulan & Verifikasi Berkas Skripsi",
      login_deskripsi: "Portal akademik terpadu untuk pengumpulan dan verifikasi berkas Seminar Proposal, Seminar Hasil, dan Ujian Meja / Skripsi.",
      login_petunjuk_admin: "",
      login_petunjuk_mhs: "Masukkan nama lengkap NIM Anda",
      helpdesk_info: "Butuh aktivasi NIM? Hubungi Helpdesk Akademik.",
    };
    Object.keys(defaults).forEach((k) => { if (!(k in cfgResult)) cfgResult[k] = defaults[k]; });

    // Format mahasiswa & stats
    const portalKeys = Object.keys(activePortals);
    const mhsData = mahasiswaList.map((mhs) => {
      const subMap = {};
      mhs.submissions.forEach((s) => { subMap[s.portal] = s; });
      const approvedCount = Object.values(subMap).filter((s) => s.status === "APPROVED").length;
      let statusRingkas = "Baru Terdaftar";
      for (let i = portalKeys.length - 1; i >= 0; i--) {
        const pk = portalKeys[i];
        if (subMap[pk] && subMap[pk].status === "APPROVED") {
          let pName = activePortals[pk] ? activePortals[pk].nama : pk;
          if (pName.includes(':')) pName = pName.split(':')[1].trim();
          statusRingkas = pName.toLowerCase().startsWith('lulus') ? pName : `Lulus ${pName}`;
          break;
        }
      }
      if (statusRingkas === "Baru Terdaftar") {
        if (Object.values(subMap).some((s) => s.status === "REVISION")) statusRingkas = "Dalam Revisi";
        else if (Object.values(subMap).some((s) => s.status === "PENDING")) statusRingkas = "Menunggu Verifikasi";
      }
      const jadwalTerdekat = mhs.jadwal && mhs.jadwal[0] ? mhs.jadwal[0] : null;
      return {
        id: mhs.id, nim: mhs.nim, nama: mhs.nama, angkatan: mhs.angkatan,
        prodi: mhs.prodi, judulSkripsi: mhs.judulSkripsi, statusRingkas,
        fotoProfil: mhs.fotoProfil,
        approvedCount, totalPortal: portalKeys.length,
        jadwalTerdekat: jadwalTerdekat ? { jenis: jadwalTerdekat.jenis, tanggal: jadwalTerdekat.tanggal, jam: jadwalTerdekat.jam, ruangan: jadwalTerdekat.ruangan } : null,
      };
    });

    const colorPresets = [
      { color: '#0284c7', bg: '#e0f2fe', icon: 'fa-solid fa-file-circle-check' },
      { color: '#d97706', bg: '#fef3c7', icon: 'fa-solid fa-clipboard-check' },
      { color: '#059669', bg: '#d1fae5', icon: 'fa-solid fa-award' },
      { color: '#7c3aed', bg: '#ede9fe', icon: 'fa-solid fa-graduation-cap' },
      { color: '#db2777', bg: '#fce7f3', icon: 'fa-solid fa-medal' },
      { color: '#2563eb', bg: '#dbeafe', icon: 'fa-solid fa-certificate' },
    ];

    const stageCards = portalKeys.map((key, idx) => {
      const p = activePortals[key];
      let label = p && p.nama ? p.nama : key;
      if (label.includes(':')) label = label.split(':')[1].trim();
      if (!label.toLowerCase().startsWith('lulus') && !label.toLowerCase().startsWith('tahap')) {
        label = 'Lulus ' + label;
      }
      const count = mahasiswaList.filter(m => m.submissions.some(s => s.portal === key && s.status === 'APPROVED')).length;
      const preset = colorPresets[idx % colorPresets.length];
      return {
        key,
        title: p ? p.nama : key,
        label,
        count,
        color: preset.color,
        bg: preset.bg,
        icon: preset.icon,
      };
    });

    const stats = {
      totalMahasiswa: mahasiswaList.length,
      stageCards,
      lulusSempro: stageCards[0] ? stageCards[0].count : 0,
      lulusSemhas: stageCards[1] ? stageCards[1].count : 0,
      lulusSkripsi: stageCards[2] ? stageCards[2].count : 0,
      dalamRevisi: mhsData.filter((d) => d.statusRingkas === "Dalam Revisi").length,
      menungguVerifikasi: mhsData.filter((d) => d.statusRingkas === "Menunggu Verifikasi").length,
    };

    return res.json({
      success: true,
      config: cfgResult,
      portals: activePortals,
      mahasiswa: mhsData,
      stats,
      jadwal: jadwalList,
      types,
    });
  } catch (error) {
    console.error("Error get publik bootstrap:", error);
    return res.status(500).json({ success: false, message: "Gagal memuat bootstrap publik." });
  }
});

module.exports = router;
