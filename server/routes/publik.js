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

router.get("/mahasiswa", async (req, res) => {
  try {
    const mahasiswaList = await prisma.mahasiswa.findMany({
      include: {
        submissions: true,
        jadwal: { where: { status: "TERJADWAL" }, orderBy: { tanggal: "asc" }, take: 1 },
      },
      orderBy: { nim: "asc" },
    });
    const portalKeys = Object.keys(PORTAL_CONFIG);
    const data = mahasiswaList.map((mhs) => {
      const subMap = {};
      mhs.submissions.forEach((s) => { subMap[s.portal] = s; });
      const approvedCount = Object.values(subMap).filter((s) => s.status === "APPROVED").length;
      let statusRingkas = "Baru Terdaftar";
      if (subMap["PORTAL_3"] && subMap["PORTAL_3"].status === "APPROVED") statusRingkas = "Lulus Skripsi";
      else if (subMap["PORTAL_2"] && subMap["PORTAL_2"].status === "APPROVED") statusRingkas = "Lulus Semhas";
      else if (subMap["PORTAL_1"] && subMap["PORTAL_1"].status === "APPROVED") statusRingkas = "Lulus Sempro";
      else if (Object.values(subMap).some((s) => s.status === "REVISION")) statusRingkas = "Dalam Revisi";
      else if (Object.values(subMap).some((s) => s.status === "PENDING")) statusRingkas = "Menunggu Verifikasi";
      const jadwalTerdekat = mhs.jadwal && mhs.jadwal[0] ? mhs.jadwal[0] : null;
      return {
        id: mhs.id, nim: mhs.nim, nama: mhs.nama, angkatan: mhs.angkatan,
        prodi: mhs.prodi, judulSkripsi: mhs.judulSkripsi, statusRingkas,
        approvedCount, totalPortal: portalKeys.length,
        jadwalTerdekat: jadwalTerdekat ? { jenis: jadwalTerdekat.jenis, tanggal: jadwalTerdekat.tanggal, jam: jadwalTerdekat.jam, ruangan: jadwalTerdekat.ruangan } : null,
      };
    });
    const stats = {
      totalMahasiswa: mahasiswaList.length,
      lulusSempro: data.filter((d) => ["Lulus Sempro","Lulus Semhas","Lulus Skripsi"].includes(d.statusRingkas)).length,
      lulusSemhas: data.filter((d) => ["Lulus Semhas","Lulus Skripsi"].includes(d.statusRingkas)).length,
      lulusSkripsi: data.filter((d) => d.statusRingkas === "Lulus Skripsi").length,
      dalamRevisi: data.filter((d) => d.statusRingkas === "Dalam Revisi").length,
      menungguVerifikasi: data.filter((d) => d.statusRingkas === "Menunggu Verifikasi").length,
    };
    return res.json({ success: true, mahasiswa: data, stats });
  } catch (error) {
    console.error("Error get publik mahasiswa:", error);
    return res.status(500).json({ success: false, message: "Gagal memuat data mahasiswa." });
  }
});

router.get("/jadwal", async (req, res) => {
  try {
    const jadwalList = await prisma.jadwalUjian.findMany({
      where: { status: "TERJADWAL", tanggal: { gte: new Date(new Date().setHours(0,0,0,0)) } },
      include: { mahasiswa: { select: { id: true, nim: true, nama: true, prodi: true, angkatan: true } } },
      orderBy: { tanggal: "asc" },
      take: 20,
    });
    return res.json({ success: true, jadwal: jadwalList });
  } catch (error) {
    console.error("Error get jadwal publik:", error);
    return res.status(500).json({ success: false, message: "Gagal memuat jadwal ujian." });
  }
});

module.exports = router;
