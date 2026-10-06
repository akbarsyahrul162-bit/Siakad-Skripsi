const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Melakukan seeding data awal...');

  // 1. Akun Dosen / Admin
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('password123', salt);

  const admin = await prisma.admin.upsert({
    where: { username: 'dosen' },
    update: {},
    create: {
      username: 'dosen',
      password: hashedPassword,
      nama: 'Dr. Ir. Fitrah, M.T.',
      role: 'DOSEN',
    },
  });
  console.log(`✅ Akun Dosen siap: ${admin.username} / password123`);

  // 2. Data Mahasiswa Whitelist Awal
  const mhs1 = await prisma.mahasiswa.upsert({
    where: { nim: '452021001' },
    update: {},
    create: {
      nim: '452021001',
      nama: 'Ahmad Fauzi',
      angkatan: '2021',
      prodi: 'Teknik Informatika',
      judulSkripsi: 'Rancang Bangun Sistem Keamanan IoT Berbasis Raspberry Pi dan MQTT',
      submissions: {
        create: [
          {
            portal: 'PORTAL_1',
            driveUrl: 'https://drive.google.com/drive/folders/1demoFolderSemproFauzi',
            status: 'PENDING',
            catatanDosen: null,
          },
        ],
      },
    },
  });

  const mhs2 = await prisma.mahasiswa.upsert({
    where: { nim: '452021045' },
    update: {},
    create: {
      nim: '452021045',
      nama: 'Siti Nurhaliza',
      angkatan: '2021',
      prodi: 'Teknik Informatika',
      judulSkripsi: 'Implementasi Deep Learning untuk Deteksi Penyakit Daun Padi',
      submissions: {
        create: [
          {
            portal: 'PORTAL_1',
            driveUrl: 'https://drive.google.com/drive/folders/1demoFolderSemproSiti',
            status: 'APPROVED',
            catatanDosen: 'Berkas lengkap dan lembar pengesahan sudah sesuai. Lanjutkan penelitian.',
            verifiedBy: 'Dr. Ir. Fitrah, M.T.',
            verifiedAt: new Date(),
          },
          {
            portal: 'PORTAL_2',
            driveUrl: 'https://drive.google.com/drive/folders/1demoFolderSemhasSiti',
            status: 'REVISION',
            catatanDosen: 'Hasil uji Turnitin masih 28%, batas maksimal 20%. Mohon lakukan parafrase dan unggah ulang berkas Turnitin.',
            verifiedBy: 'Dr. Ir. Fitrah, M.T.',
            verifiedAt: new Date(),
          },
        ],
      },
    },
  });

  const mhs3 = await prisma.mahasiswa.upsert({
    where: { nim: '452020088' },
    update: {},
    create: {
      nim: '452020088',
      nama: 'Rizky Pratama',
      angkatan: '2020',
      prodi: 'Teknik Informatika',
      judulSkripsi: 'Sistem Informasi Manajemen Aset Laboratorium Berbasis Web',
    },
  });

  console.log(`✅ Data Whasiswa Whitelist siap: ${mhs1.nama}, ${mhs2.nama}, ${mhs3.nama}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
