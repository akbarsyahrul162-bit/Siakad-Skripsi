// Deteksi jika dibuka langsung via file:/// bukan http://localhost:3000
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.protocol === 'file:') {
    showAlert('<strong>Perhatian:</strong> Halaman ini dibuka langsung dari File Explorer (file:///), sehingga koneksi ke backend database diblokir oleh browser. Silakan buka lewat link server lokal: <a href="http://localhost:3000" style="color:#1d4ed8; font-weight:bold; text-decoration:underline;">http://localhost:3000</a>', 'warning');
  }
});

// Switch role tab
function switchTab(role) {
  const tabMhs = document.getElementById('tabMahasiswa');
  const tabDosen = document.getElementById('tabDosen');
  const formMhs = document.getElementById('formLoginMahasiswa');
  const formDosen = document.getElementById('formLoginDosen');
  const alertBox = document.getElementById('loginAlert');

  alertBox.style.display = 'none';

  if (role === 'MAHASISWA') {
    tabMhs.classList.add('active');
    tabDosen.classList.remove('active');
    formMhs.style.display = 'block';
    formDosen.style.display = 'none';
  } else {
    tabDosen.classList.add('active');
    tabMhs.classList.remove('active');
    formDosen.style.display = 'block';
    formMhs.style.display = 'none';
  }
}

// Show alert
function showAlert(message, type = 'danger') {
  const alertBox = document.getElementById('loginAlert');
  alertBox.className = `alert-box alert-${type}`;
  alertBox.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
      <i class="fa-solid fa-${type === 'danger' ? 'triangle-exclamation' : 'circle-check'}" style="margin-top: 2px;"></i>
      <div>${message}</div>
    </div>
  `;
  alertBox.style.display = 'block';
}

// Quick fills for demo
function quickFillNim(nim) {
  switchTab('MAHASISWA');
  document.getElementById('inputNim').value = nim;
}

function quickFillDosen(username, password) {
  switchTab('DOSEN');
  document.getElementById('inputUsername').value = username;
  document.getElementById('inputPassword').value = password;
}

// Login Mahasiswa (Whitelist check)
async function handleLoginMahasiswa(event) {
  event.preventDefault();
  const nim = document.getElementById('inputNim').value.trim();
  const btn = document.getElementById('btnSubmitMhs');

  if (!nim) {
    showAlert('Silakan masukkan NIM terlebih dahulu.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa Whitelist NIM...`;

  try {
    const res = await fetch('/api/auth/login-mahasiswa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.isNotWhitelisted) {
        // Pesan peringatan khusus sesuai konsep user
        showAlert(`<strong>Akses Ditolak:</strong> ${data.message}`, 'danger');
      } else {
        showAlert(data.message || 'Gagal masuk.', 'danger');
      }
      btn.disabled = false;
      btn.innerHTML = `<span>Masuk ke Dashboard Mahasiswa</span> <i class="fa-solid fa-arrow-right"></i>`;
      return;
    }

    showAlert(`Login berhasil! Mengalihkan ke dashboard...`, 'success');
    setTimeout(() => {
      window.location.href = data.redirect || '/mahasiswa.html';
    }, 600);
  } catch (err) {
    console.error(err);
    showAlert('Koneksi ke server gagal. Pastikan server aktif.', 'danger');
    btn.disabled = false;
    btn.innerHTML = `<span>Masuk ke Dashboard Mahasiswa</span> <i class="fa-solid fa-arrow-right"></i>`;
  }
}

// Login Dosen / Admin
async function handleLoginDosen(event) {
  event.preventDefault();
  const username = document.getElementById('inputUsername').value.trim();
  const password = document.getElementById('inputPassword').value;
  const btn = document.getElementById('btnSubmitDosen');

  if (!username || !password) {
    showAlert('Username dan password wajib diisi.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi...`;

  try {
    const res = await fetch('/api/auth/login-dosen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.message || 'Login gagal.', 'danger');
      btn.disabled = false;
      btn.innerHTML = `<span>Masuk ke Portal Dosen</span> <i class="fa-solid fa-arrow-right"></i>`;
      return;
    }

    showAlert(`Login berhasil! Mengalihkan ke direktori monitoring...`, 'success');
    setTimeout(() => {
      window.location.href = data.redirect || '/admin.html';
    }, 600);
  } catch (err) {
    console.error(err);
    showAlert('Koneksi server gagal.', 'danger');
    btn.disabled = false;
    btn.innerHTML = `<span>Masuk ke Portal Dosen</span> <i class="fa-solid fa-arrow-right"></i>`;
  }
}
