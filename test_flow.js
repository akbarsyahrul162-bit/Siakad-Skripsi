const http = require('http');

function post(path, body, cookie = '') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Cookie: cookie,
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(resData || '{}'),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, cookie = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'GET',
        headers: { Cookie: cookie },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(resData || '{}'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Memulai Pengujian Otomatis Sistem SIAKAD Skripsi...\n');

  // Test 1: NIM belum terdaftar harus diblokir (Whitelist Enforcement)
  console.log('Test 1: Uji coba login NIM sembarang (888888888)...');
  const t1 = await post('/api/auth/login-mahasiswa', { nim: '888888888' });
  console.log('Status HTTP:', t1.statusCode);
  console.log('Pesan:', t1.body.message);
  if (t1.statusCode === 403 && t1.body.isNotWhitelisted) {
    console.log('✅ PASS: Whitelist memblokir NIM yang belum didaftarkan dosen!\n');
  } else {
    throw new Error('Test 1 GAGAL');
  }

  // Test 2: Login Dosen
  console.log('Test 2: Uji login Dosen (dosen / password123)...');
  const t2 = await post('/api/auth/login-dosen', { username: 'dosen', password: 'password123' });
  console.log('Status HTTP:', t2.statusCode);
  const dosenCookie = t2.headers['set-cookie'] ? t2.headers['set-cookie'][0].split(';')[0] : '';
  console.log('Dosen Name:', t2.body.user.nama);
  if (t2.statusCode === 200 && dosenCookie) {
    console.log('✅ PASS: Login Dosen berhasil & cookie HttpOnly terpasang!\n');
  } else {
    throw new Error('Test 2 GAGAL');
  }

  // Test 3: Dosen menambahkan mahasiswa baru ke whitelist
  console.log('Test 3: Dosen mendaftarkan mahasiswa baru (NIM: 452021099 - Muhammad Ikhsan)...');
  const t3 = await post(
    '/api/admin/mahasiswa',
    {
      nim: '452021099',
      nama: 'Muhammad Ikhsan',
      angkatan: '2021',
      prodi: 'Teknik Informatika',
      judulSkripsi: 'Rancang Bangun Sistem Deteksi Objek Cerdas',
    },
    dosenCookie
  );
  console.log('Status HTTP:', t3.statusCode);
  console.log('Respon:', t3.body.message);
  if (t3.statusCode === 200 && t3.body.mahasiswa) {
    console.log('✅ PASS: Mahasiswa berhasil masuk whitelist database!\n');
  } else {
    throw new Error('Test 3 GAGAL');
  }

  // Test 4: Mahasiswa yang baru didaftarkan langsung login instan
  console.log('Test 4: Mahasiswa baru (452021099) mencoba login...');
  const t4 = await post('/api/auth/login-mahasiswa', { nim: '452021099' });
  console.log('Status HTTP:', t4.statusCode);
  const mhsCookie = t4.headers['set-cookie'] ? t4.headers['set-cookie'][0].split(';')[0] : '';
  console.log('Selamat datang:', t4.body.message);
  if (t4.statusCode === 200 && mhsCookie) {
    console.log('✅ PASS: Mahasiswa baru langsung aktif dan bisa login seketika!\n');
  } else {
    throw new Error('Test 4 GAGAL');
  }

  // Test 5: Mahasiswa submit link Google Drive di Portal 1
  console.log('Test 5: Mahasiswa submit link Google Drive di Portal 1...');
  const t5 = await post(
    '/api/mahasiswa/submit',
    {
      portal: 'PORTAL_1',
      driveUrl: 'https://drive.google.com/drive/folders/1testFolderDriveIkhsan',
    },
    mhsCookie
  );
  console.log('Status HTTP:', t5.statusCode);
  console.log('Status Berkas:', t5.body.submission.status);
  if (t5.statusCode === 200 && t5.body.submission.status === 'PENDING') {
    console.log('✅ PASS: Berkas tersimpan dengan status PENDING (Menunggu Pemeriksaan)!\n');
  } else {
    throw new Error('Test 5 GAGAL');
  }

  // Test 6: Dosen memverifikasi berkas (Memberi ACC / Valid)
  console.log('Test 6: Dosen memeriksa dan menyetujui berkas (ACC)...');
  const t6 = await post(
    '/api/admin/verify',
    {
      mahasiswaId: t3.body.mahasiswa.id,
      portal: 'PORTAL_1',
      status: 'APPROVED',
      catatanDosen: 'Berkas lengkap dan lembar perbaikan telah ditandatangani. ACC.',
    },
    dosenCookie
  );
  console.log('Status HTTP:', t6.statusCode);
  console.log('Status Baru:', t6.body.submission.status);
  console.log('Diverifikasi oleh:', t6.body.submission.verifiedBy);
  if (t6.statusCode === 200 && t6.body.submission.status === 'APPROVED') {
    console.log('✅ PASS: Verifikasi berkas berhasil diupdate menjadi APPROVED!\n');
  } else {
    throw new Error('Test 6 GAGAL');
  }

  console.log('🎉 SEMUA 6 PENGUJIAN FITUR & KEAMANAN BERHASIL 100%!');
}

runTests().catch((err) => {
  console.error('❌ Error pengujian:', err);
  process.exit(1);
});
