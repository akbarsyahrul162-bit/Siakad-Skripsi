// Deteksi protokol dan inisialisasi tab
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.protocol === 'file:') {
    showAlert('<strong>Perhatian:</strong> Halaman ini dibuka via file:///. Silakan buka via server lokal atau link online Cloudflare.', 'warning');
  }

  // Pasang event listener langsung ke tombol tab agar pasti berfungsi di semua browser & HP
  const tabMhs = document.getElementById('tabMahasiswa');
  const tabDosen = document.getElementById('tabDosen');

  if (tabMhs) {
    tabMhs.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('MAHASISWA');
    });
  }

  if (tabDosen) {
    tabDosen.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('DOSEN');
    });
  }
});

// Switch role tab
function switchTab(role) {
  const tabMhs = document.getElementById('tabMahasiswa');
  const tabDosen = document.getElementById('tabDosen');
  const formMhs = document.getElementById('formLoginMahasiswa');
  const formDosen = document.getElementById('formLoginDosen');
  const alertBox = document.getElementById('loginAlert');

  if (alertBox) alertBox.style.display = 'none';

  if (role === 'MAHASISWA') {
    if (tabMhs) tabMhs.classList.add('active');
    if (tabDosen) tabDosen.classList.remove('active');
    if (formMhs) formMhs.style.display = 'block';
    if (formDosen) formDosen.style.display = 'none';
  } else {
    if (tabDosen) tabDosen.classList.add('active');
    if (tabMhs) tabMhs.classList.remove('active');
    if (formDosen) formDosen.style.display = 'block';
    if (formMhs) formMhs.style.display = 'none';
  }
}

// Show alert
function showAlert(message, type = 'danger') {
  const alertBox = document.getElementById('loginAlert');
  if (!alertBox) return;
  alertBox.className = `alert-box alert-${type}`;
  alertBox.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
      <i class="fa-solid fa-${type === 'danger' ? 'triangle-exclamation' : 'circle-check'}" style="margin-top: 2px;"></i>
      <div>${message}</div>
    </div>
  `;
  alertBox.style.display = 'block';
}

// Quick fill NIM
function quickFillNim(nim) {
  switchTab('MAHASISWA');
  const input = document.getElementById('inputNim');
  if (input) input.value = nim;
}

// Quick fill & langsung login Dosen otomatis dengan 1 klik!
async function autoLoginDosen() {
  switchTab('DOSEN');
  const u = document.getElementById('inputUsername');
  const p = document.getElementById('inputPassword');
  if (u) u.value = 'dosen';
  if (p) p.value = 'password123';

  // Langsung trigger login
  const fakeEvent = { preventDefault: () => {} };
  await handleLoginDosen(fakeEvent);
}

function quickFillDosen(username, password) {
  switchTab('DOSEN');
  const u = document.getElementById('inputUsername');
  const p = document.getElementById('inputPassword');
  if (u) u.value = username;
  if (p) p.value = password;
}

// Login Mahasiswa (Whitelist check)
async function handleLoginMahasiswa(event) {
  if (event && event.preventDefault) event.preventDefault();
  const input = document.getElementById('inputNim');
  const nim = input ? input.value.trim() : '';
  const btn = document.getElementById('btnSubmitMhs');

  if (!nim) {
    showAlert('Silakan masukkan NIM terlebih dahulu.', 'warning');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa Whitelist NIM...`;
  }

  try {
    const res = await fetch('/api/auth/login-mahasiswa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.isNotWhitelisted) {
        showAlert(`<strong>Akses Ditolak:</strong> ${data.message}`, 'danger');
      } else {
        showAlert(data.message || 'Gagal masuk.', 'danger');
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Masuk ke Dashboard Mahasiswa</span> <i class="fa-solid fa-arrow-right"></i>`;
      }
      return;
    }

    showAlert(`Login berhasil! Mengalihkan ke dashboard...`, 'success');
    setTimeout(() => {
      window.location.href = data.redirect || '/mahasiswa.html';
    }, 400);
  } catch (err) {
    console.error(err);
    showAlert('Koneksi ke server gagal. Pastikan server aktif.', 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Masuk ke Dashboard Mahasiswa</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}

// Login Dosen / Admin
async function handleLoginDosen(event) {
  if (event && event.preventDefault) event.preventDefault();
  const u = document.getElementById('inputUsername');
  const p = document.getElementById('inputPassword');
  const username = u ? u.value.trim() : '';
  const password = p ? p.value : '';
  const btn = document.getElementById('btnSubmitDosen');

  if (!username || !password) {
    showAlert('Username dan password wajib diisi.', 'warning');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi Kredensial Dosen...`;
  }

  try {
    const res = await fetch('/api/auth/login-dosen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.message || 'Login gagal.', 'danger');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Masuk ke Portal Dosen</span> <i class="fa-solid fa-arrow-right"></i>`;
      }
      return;
    }

    showAlert(`Login berhasil! Mengalihkan ke portal dosen...`, 'success');
    setTimeout(() => {
      window.location.href = data.redirect || '/admin.html';
    }, 400);
  } catch (err) {
    console.error(err);
    showAlert('Koneksi server gagal.', 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Masuk ke Portal Dosen</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}
