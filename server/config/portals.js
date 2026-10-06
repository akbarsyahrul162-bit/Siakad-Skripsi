const PORTAL_CONFIG = {
  PORTAL_1: {
    id: 'PORTAL_1',
    nama: 'Portal 1: Pasca Seminar Proposal & Izin Penelitian',
    deskripsi: 'Pengumpulan berkas pengesahan revisi proposal dan surat pengantar izin penelitian lapangan/laboratorium.',
    berkas: [
      {
        nomor: 1,
        nama: 'Lembar Perbaikan / Revisi Proposal',
        keterangan: 'Telah ditandatangani oleh penguji dan pembimbing',
        formatContoh: '01_Revisi_Proposal_[NIM].pdf',
      },
      {
        nomor: 2,
        nama: 'Berita Acara & Daftar Nilai Seminar Proposal',
        keterangan: 'Lembaran asli/salinan nilai dan berita acara ujian sempro',
        formatContoh: '02_Berita_Acara_Sempro_[NIM].pdf',
      },
      {
        nomor: 3,
        nama: 'Surat Izin Penelitian / Pengambilan Data',
        keterangan: 'Surat resmi dari fakultas / layanan akademik mahasiswa',
        formatContoh: '03_Izin_Penelitian_[NIM].pdf',
      },
      {
        nomor: 4,
        nama: 'SK Pembimbing Final / Bukti Penyesuaian Judul',
        keterangan: 'Wajib jika terdapat perubahan judul riset hasil masukan dewan penguji',
        formatContoh: '04_SK_Pembimbing_Judul_[NIM].pdf',
      },
    ],
  },
  PORTAL_2: {
    id: 'PORTAL_2',
    nama: 'Portal 2: Pendaftaran Seminar Hasil (Semhas)',
    deskripsi: 'Verifikasi berkas persyaratan sebelum mahasiswa dijadwalkan mengikuti Seminar Hasil Penelitian.',
    berkas: [
      {
        nomor: 1,
        nama: 'Kartu Logbook / Bukti Bimbingan Skripsi',
        keterangan: 'Riwayat bimbingan minimal Pembimbing I & II sesuai ketentuan prodi',
        formatContoh: '01_Logbook_Bimbingan_[NIM].pdf',
      },
      {
        nomor: 2,
        nama: 'Lembar Persetujuan ACC Ujian Hasil',
        keterangan: 'Draft naskah Bab I–V telah disetujui lengkap oleh para pembimbing',
        formatContoh: '02_Lembar_ACC_Semhas_[NIM].pdf',
      },
      {
        nomor: 3,
        nama: 'Bukti Lolos Uji Plagiasi (Turnitin)',
        keterangan: 'Sertifikat/laporan kesamaan Turnitin sesuai ambang batas toleransi (<20%)',
        formatContoh: '03_Lolos_Plagiasi_Turnitin_[NIM].pdf',
      },
      {
        nomor: 4,
        nama: 'Bukti Pembayaran SPP Berjalan & Biaya Seminar',
        keterangan: 'Slip setoran bank / bukti transfer biaya akademik semester berjalan',
        formatContoh: '04_Bukti_SPP_Seminar_[NIM].pdf',
      },
    ],
  },
  PORTAL_3: {
    id: 'PORTAL_3',
    nama: 'Portal 3: Pasca Seminar Hasil & Pendaftaran Ujian Skripsi (Ujian Tutup)',
    deskripsi: 'Tahap akhir pendaftaran Ujian Komprehensif / Meja Hijau / Ujian Tutup Skripsi.',
    berkas: [
      {
        nomor: 1,
        nama: 'Berita Acara Seminar Hasil',
        keterangan: 'Lengkap tanda tangan ketua sidang, sekretaris, dan tim penguji',
        formatContoh: '01_Berita_Acara_Semhas_[NIM].pdf',
      },
      {
        nomor: 2,
        nama: 'Lembar Perbaikan (Revisi) Skripsi Pasca-Semhas',
        keterangan: 'Format revisi yang telah di-ACC seluruh penguji dan pembimbing',
        formatContoh: '02_Revisi_Semhas_[NIM].pdf',
      },
      {
        nomor: 3,
        nama: 'Surat Keterangan Selesai Penelitian',
        keterangan: 'Surat resmi dari instansi/perusahaan/lokasi pengambilan data riset',
        formatContoh: '03_Ket_Selesai_Penelitian_[NIM].pdf',
      },
      {
        nomor: 4,
        nama: 'Formulir Pendaftaran Ujian Skripsi / Komprehensif',
        keterangan: 'Formulir resmi pendaftaran ujian tutup yang telah diisi lengkap',
        formatContoh: '04_Form_Daftar_Ujian_Skripsi_[NIM].pdf',
      },
      {
        nomor: 5,
        nama: 'Transkrip Nilai Sementara',
        keterangan: 'Verifikasi bebas mata kuliah mengulang & pemenuhan syarat minimal SKS/IPK',
        formatContoh: '05_Transkrip_Sementara_[NIM].pdf',
      },
      {
        nomor: 6,
        nama: 'Draft Naskah Skripsi Lengkap Final',
        keterangan: 'Softcopy naskah lengkap (Cover s.d. Lampiran) siap uji dalam format PDF',
        formatContoh: '06_Draft_Skripsi_Final_[NIM].pdf',
      },
    ],
  },
};

module.exports = PORTAL_CONFIG;
