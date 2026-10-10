let socket = null;
let allStudents = [];
let filteredStudents = [];
let globalPortalsConfig = {};
let currentViewingStudent = null;
let currentViewingPortals = [];
let activePortalKey = 'PORTAL_1';
let activeReqPortalKey = 'PORTAL_1';
let selectedDecision = null;
let allJadwalList = [];
let globalJadwalTypes = [
  { id: 'SEMPRO', nama: 'Seminar Proposal (Sempro)', badgeColor: '#0369a1', badgeBg: '#e0f2fe' },
  { id: 'SEMHAS', nama: 'Seminar Hasil (Semhas)', badgeColor: '#b45309', badgeBg: '#fef3c7' },
  { id: 'SIDANG', nama: 'Sidang Skripsi / Ujian Tutup', badgeColor: '#15803d', badgeBg: '#dcfce7' },
  { id: 'WISUDA', nama: 'Wisuda Sarjana & Yudisium', badgeColor: '#7e22ce', badgeBg: '#f3e8ff' },
];
let globalJadwalTypesMap = {};
let currentDosenProfile = {
  nama: 'Dr. Ir. Fitrah, M.T.',
  jabatan: 'Dosen Pembimbing Skripsi',
  foto: null,
};
let pendingDosenPhotoBase64 = null;

const STATUS_META = {
  EMPTY: { label: 'Belum Diisi', cls: 'badge-EMPTY', icon: 'fa-regular fa-clock' },
  PENDING: { label: 'Periksa Berkas', cls: 'badge-PENDING', icon: 'fa-solid fa-hourglass-half' },
  APPROVED: { label: 'ACC / Valid', cls: 'badge-APPROVED', icon: 'fa-solid fa-circle-check' },
  REVISION: { label: 'Revisi', cls: 'badge-REVISION', icon: 'fa-solid fa-triangle-exclamation' },
};

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  const hasCache = restoreAdminCache();
  if (!hasCache) {
    renderAdminSkeletons();
  }
  fetchAdminBootstrap(false);
});

// A. Restore data admin instan 0.005 detik dari Local Cache Browser
function restoreAdminCache() {
  try {
    const raw = localStorage.getItem('admin_bootstrap_cache');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.success) return false;

    if (data.portalsConfig) {
      globalPortalsConfig = data.portalsConfig;
      renderTableHeaders();
    }
    if (data.profile) {
      currentDosenProfile = data.profile;
      renderDosenProfileNavbar(currentDosenProfile);
    }
    if (Array.isArray(data.types)) {
      globalJadwalTypes = data.types;
      rebuildJadwalTypesMap();
      populateJadwalJenisDropdown();
    }
    if (Array.isArray(data.jadwal)) {
      allJadwalList = data.jadwal;
      renderJadwalTable(allJadwalList);
      populateJadwalMhsDropdown();
    }
    if (Array.isArray(data.mahasiswa)) {
      allStudents = data.mahasiswa;
      populateAngkatanDatalist('listAngkatanAdmin');
      updateStats(data);
      handleSearchFilter();
    }
    if (data.siteconfig) {
      applyAdminSiteConfig(data.siteconfig);
    }
    return true;
  } catch (e) {
    console.warn('Gagal membaca cache admin:', e);
    return false;
  }
}

// B. Render Skeleton Rows jika belum ada cache (pengunjung pertama)
function renderAdminSkeletons() {
  const tbody = document.getElementById('studentTableBody');
  if (tbody) {
    let rowsHtml = '';
    for (let i = 0; i < 5; i++) {
      rowsHtml += `
        <tr>
          <td style="text-align: center;"><span class="skeleton-shimmer skeleton-text" style="width: 20px;"></span></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="skeleton-shimmer skeleton-circle"></div>
              <div>
                <span class="skeleton-shimmer skeleton-text" style="width: 150px; display: block;"></span>
                <span class="skeleton-shimmer skeleton-text" style="width: 90px; display: block;"></span>
              </div>
            </div>
          </td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 100px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 220px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 100px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 100px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 100px; display: block;"></span></td>
          <td style="text-align: right;"><span class="skeleton-shimmer skeleton-text" style="width: 60px; display: inline-block;"></span></td>
        </tr>
      `;
    }
    tbody.innerHTML = rowsHtml;
  }
}

// C. High-Speed Admin Bootstrap Fetcher (1 Round-Trip HTTP Request)
function applyBootstrapPayload(data) {
  if (!data || !data.success) return;
  try {
    localStorage.setItem('admin_bootstrap_cache', JSON.stringify(data));
  } catch (e) {}

  if (data.portalsConfig) {
    globalPortalsConfig = data.portalsConfig;
    renderTableHeaders();
  }
  if (data.profile) {
    currentDosenProfile = data.profile;
    renderDosenProfileNavbar(currentDosenProfile);
  }
  if (Array.isArray(data.types)) {
    globalJadwalTypes = data.types;
    rebuildJadwalTypesMap();
    populateJadwalJenisDropdown();
  }
  if (Array.isArray(data.jadwal)) {
    allJadwalList = data.jadwal;
    renderJadwalTable(allJadwalList);
    populateJadwalMhsDropdown();
  }
  if (Array.isArray(data.mahasiswa)) {
    allStudents = data.mahasiswa;
    populateAngkatanDatalist('listAngkatanAdmin');
    updateStats(data);
    handleSearchFilter();
  }
  if (data.siteconfig) {
    applyAdminSiteConfig(data.siteconfig);
  }
}

async function fetchAdminBootstrap(showLoading = false) {
  const tbody = document.getElementById('studentTableBody');
  if (showLoading && tbody && allStudents.length === 0) {
    renderAdminSkeletons();
  }

  // 1. Coba Single Round-Trip Bootstrap API dengan timeout 8 detik
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('/api/admin/bootstrap', {
      headers: getAuthHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login.html';
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal memuat bootstrap`);
    }

    const data = await res.json();
    if (data.success) {
      applyBootstrapPayload(data);
      return;
    }
    throw new Error(data.message || 'Respons bootstrap tidak sukses');
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('Bootstrap API timeout atau gagal, mencoba fallback individual API...', err.message);

    // 2. Fallback Otomatis ke rute individual jika /bootstrap mengalami cold-boot delay
    try {
      const [resMhs, resJadwal] = await Promise.all([
        fetch('/api/admin/mahasiswa', { headers: getAuthHeaders() }),
        fetch('/api/admin/jadwal', { headers: getAuthHeaders() }),
      ]);

      if (resMhs.status === 401 || resMhs.status === 403) {
        window.location.href = '/login.html';
        return;
      }

      if (resMhs.ok) {
        const mhsData = await resMhs.json();
        if (mhsData.success) {
          if (mhsData.portalsConfig) {
            globalPortalsConfig = mhsData.portalsConfig;
            renderTableHeaders();
          }
          if (Array.isArray(mhsData.mahasiswa)) {
            allStudents = mhsData.mahasiswa;
            populateAngkatanDatalist('listAngkatanAdmin');
            updateStats(mhsData);
            handleSearchFilter();
          }
        }
      }

      if (resJadwal.ok) {
        const jadwalData = await resJadwal.json();
        if (jadwalData.success && Array.isArray(jadwalData.jadwal)) {
          allJadwalList = jadwalData.jadwal;
          renderJadwalTable(allJadwalList);
          populateJadwalMhsDropdown();
        }
      }
    } catch (fallbackErr) {
      console.error('Fallback API juga gagal:', fallbackErr);

      // Jika benar-benar belum ada data dari cache dan server offline
      if (allStudents.length === 0 && tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 2.5rem 1rem; color: #64748b;">
              <i class="fa-solid fa-cloud-bolt" style="font-size: 2rem; color: #ef4444; margin-bottom: 0.75rem; display: block;"></i>
              <strong style="color: #1e293b; font-size: 0.95rem;">Koneksi ke Server Memerlukan Waktu Lebih Lama</strong>
              <p style="font-size: 0.82rem; margin: 0.4rem 0 1rem;">Database serverless sedang melakukan inisialisasi awal. Silakan coba muat ulang data.</p>
              <button onclick="fetchAdminBootstrap(true)" class="btn-primary" style="margin: 0 auto; width: auto; font-size: 0.82rem; padding: 0.5rem 1.25rem;">
                <i class="fa-solid fa-rotate-right"></i> Coba Muat Ulang Sekarang
              </button>
            </td>
          </tr>
        `;
      }
    }
  }
}

function applyAdminSiteConfig(cfg) {
  if (!cfg) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  };

  setVal('cfg_dosen_nama', currentDosenProfile.nama || 'Dr. Ir. Fitrah, M.T.');
  setVal('cfg_dosen_jabatan', currentDosenProfile.jabatan || 'Dosen Pembimbing Skripsi');
  setVal('cfg_beranda_header_chip', cfg.beranda_header_chip || 'Tahun Akademik 2024/2025 Genap');
  setVal('cfg_beranda_title', cfg.beranda_title || 'Portal Monitoring Skripsi & Akademik Bimbingan');
  setVal('cfg_beranda_subtitle', cfg.beranda_subtitle || 'Sistem pemantauan berkas seminar proposal, seminar hasil, dan ujian skripsi secara transparan, terintegrasi, dan real-time.');
  setVal('cfg_beranda_footer', cfg.beranda_footer || 'Sistem Informasi Manajemen Skripsi & Verifikasi Berkas Terpadu • Program Studi Psikologi');
  setVal('cfg_login_judul', cfg.login_judul || 'Sistem Pengumpulan & Verifikasi Berkas Skripsi');
  setVal('cfg_login_deskripsi', cfg.login_deskripsi || 'Portal akademik terpadu untuk pengumpulan dan verifikasi berkas Seminar Proposal, Seminar Hasil, dan Ujian Meja / Skripsi.');
  setVal('cfg_login_petunjuk_admin', cfg.login_petunjuk_admin || 'Masukkan kata sandi admin12345 (atau username admin) untuk masuk ke Dashboard Monitoring.');
  setVal('cfg_login_petunjuk_mhs', cfg.login_petunjuk_mhs || 'Masukkan nama lengkap NIM Anda');
  setVal('cfg_helpdesk_info', cfg.helpdesk_info || 'Butuh aktivasi NIM? Hubungi Helpdesk Akademik Gedung Rektorat Lt. 1.');

  setTimeout(() => {
    document.querySelectorAll('#formSiteConfig .auto-expand-textarea').forEach(autoResizeTextarea);
  }, 50);

  if (typeof syncPovLive === 'function') {
    syncPovLive();
  }
}

// Auto-expand textarea helper
function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 38) + 'px';
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.classList.contains('auto-expand-textarea')) {
    autoResizeTextarea(e.target);
  }
});

// Setup Socket.io
function initSocket() {
  try {
    socket = io();

    socket.on('connect', () => {
      const el = document.getElementById('adminLiveSync');
      if (el) {
        el.innerHTML = `<span class="live-dot"></span> Real-Time Sync Aktif`;
        el.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        el.style.color = '#34d399';
      }
    });

    socket.on('disconnect', () => {
      const el = document.getElementById('adminLiveSync');
      if (el) {
        el.innerHTML = `<span class="live-dot" style="background:#ef4444; animation:none;"></span> Terputus`;
        el.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        el.style.color = '#f87171';
      }
    });

    // Real-Time Listener: Saat mahasiswa mengunggah link
    socket.on('submission_updated', (data) => {
      loadStudents(false);

      if (currentViewingStudent && currentViewingStudent.id === data.mahasiswaId) {
        openVerificationModal(data.mahasiswaId, false);
      }
    });

    // Real-Time Listener: Saat mahasiswa baru ditambahkan / diedit / dihapus
    socket.on('whitelist_updated', () => {
      loadStudents(false);
      populateJadwalMhsDropdown();
    });

    // Real-Time Listener: Saat jadwal ujian diperbarui
    socket.on('jadwal_updated', () => {
      loadJadwalAdmin(false);
    });

    // Real-Time Listener: Saat konten situs diubah
    socket.on('siteconfig_updated', () => {
      loadSiteConfigAdmin();
    });
    socket.on('siteconfig_bulk_updated', () => {
      loadSiteConfigAdmin();
    });

    // Real-Time Listener: Saat profil dosen diperbarui
    socket.on('dosen_profile_updated', (data) => {
      if (data) {
        currentDosenProfile = data;
        renderDosenProfileNavbar(data);
      }
    });

    // Real-Time Listener: Saat struktur portal / syarat diubah oleh admin
    socket.on('portals_config_updated', (data) => {
      if (data && data.portals) {
        globalPortalsConfig = data.portals;
      }
      loadStudents(false);
      const reqModal = document.getElementById('requirementsModal');
      if (reqModal && reqModal.style.display === 'flex') {
        renderRequirementsTabs();
        renderRequirementsEditor();
      }
    });

    // Real-Time Listener: Saat opsi jenis jadwal / wisuda diubah atau diedit
    socket.on('jadwal_types_updated', (data) => {
      if (data && Array.isArray(data.types)) {
        globalJadwalTypes = data.types;
        rebuildJadwalTypesMap();
        populateJadwalJenisDropdown();
        renderJadwalTable(allJadwalList);
        const modal = document.getElementById('manageJadwalTypesModal');
        if (modal && modal.style.display === 'flex') {
          renderJadwalTypesEditor();
        }
      }
    });
  } catch (err) {
    console.error('Socket error:', err);
  }
}

// Helper untuk menyertakan token otentikasi
function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...extra };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Load students directory from server (Delegated to High-Speed Bootstrap)
async function loadStudents(showLoading = false) {
  return fetchAdminBootstrap(showLoading);
}

// Render Table Headers Dynamically
function renderTableHeaders() {
  const thead = document.getElementById('studentTableHead');
  if (!thead) return;

  const portalKeys = Object.keys(globalPortalsConfig);
  let portalHeadersHtml = '';

  portalKeys.forEach((key) => {
    const p = globalPortalsConfig[key];
    const shortName = p && p.nama ? p.nama.split(':')[0].trim() : key;
    portalHeadersHtml += `<th style="min-width: 140px;">${escapeHtml(shortName)}</th>`;
  });

  thead.innerHTML = `
    <tr>
      <th style="width: 50px;">No</th>
      <th style="min-width: 180px;">Nama & NIM</th>
      <th style="min-width: 140px;">Angkatan / Prodi</th>
      <th style="min-width: 220px;">Judul Skripsi</th>
      ${portalHeadersHtml}
      <th style="text-align: right; width: 140px;">Aksi</th>
    </tr>
  `;
}

// Update Quick Stats
function updateStats(data) {
  const total = data.totalMahasiswa || allStudents.length;
  let pending = 0;
  let approved = 0;

  allStudents.forEach((m) => {
    Object.values(m.portals || {}).forEach((sub) => {
      if (sub && sub.status === 'PENDING') pending++;
      if (sub && sub.status === 'APPROVED') approved++;
    });
  });

  document.getElementById('statTotalStudents').textContent = total;
  document.getElementById('statPendingReviews').textContent = pending;
  document.getElementById('statApprovedReviews').textContent = approved;
}

// Helper deteksi dan ekstraksi angka tahun dari narasi bebas yang diketik pengguna
function extractYearFromText(input) {
  if (!input) return null;
  const str = String(input).trim();
  if (!str) return null;

  // Jika pengguna mengetik kata "semua", jangan filter (tampilkan semua angkatan)
  if (/^semua/i.test(str)) return null;

  // 1. Cek jika ada 4 digit tahun (misal: 1990 - 2099) di dalam teks
  const fourDigitMatches = str.match(/\b(19\d\d|20\d\d)\b/g);
  if (fourDigitMatches && fourDigitMatches.length > 0) {
    // Ambil tahun yang ditulis di akhir kalimat (sesuai permintaan user: "narasi lalu ditutup angka diakhir misal 2019")
    return fourDigitMatches[fourDigitMatches.length - 1];
  }

  // 2. Cek angka di akhir string (misal: "angkatan 2019" atau "mhs 19")
  const trailingDigitsMatch = str.match(/(\d+)\s*$/);
  if (trailingDigitsMatch) {
    const num = trailingDigitsMatch[1];
    if (num.length === 4) return num;
    if (num.length === 2) {
      const n = parseInt(num, 10);
      return n > 50 ? '19' + num : '20' + num;
    }
    return num;
  }

  // 3. Cek sembarang angka di dalam teks
  const anyDigitsMatch = str.match(/\d+/g);
  if (anyDigitsMatch && anyDigitsMatch.length > 0) {
    const lastNum = anyDigitsMatch[anyDigitsMatch.length - 1];
    if (lastNum.length === 4) return lastNum;
    if (lastNum.length === 2) {
      const n = parseInt(lastNum, 10);
      return n > 50 ? '19' + lastNum : '20' + lastNum;
    }
    return lastNum;
  }

  return null;
}

// Update Datalist Opsi Angkatan secara Dinamis
function populateAngkatanDatalist(datalistId) {
  const dl = document.getElementById(datalistId);
  if (!dl || !Array.isArray(allStudents)) return;
  const uniqueYears = Array.from(new Set(
    allStudents
      .map((s) => extractYearFromText(s.angkatan) || String(s.angkatan || '').trim())
      .filter((y) => y && /^\d+$/.test(y))
  )).sort().reverse();

  let html = '<option value="Semua Angkatan"></option>';
  uniqueYears.forEach((y) => {
    html += `<option value="Angkatan ${y}"></option>`;
    html += `<option value="${y}"></option>`;
  });
  dl.innerHTML = html;
}

// Filter and Search logic dengan Smart Detection Tahun Angkatan
function handleSearchFilter() {
  const query = (document.getElementById('searchStudentInput')?.value || '').toLowerCase().trim();
  const rawAngkatan = (document.getElementById('filterAngkatan')?.value || '').trim();
  const detectedYear = extractYearFromText(rawAngkatan);

  filteredStudents = allStudents.filter((m) => {
    const matchNameOrNim = (m.nama && m.nama.toLowerCase().includes(query)) || 
                           (m.nim && m.nim.toLowerCase().includes(query)) ||
                           (m.judulSkripsi && m.judulSkripsi.toLowerCase().includes(query));

    let matchAngkatan = true;
    if (detectedYear) {
      const mhsYear = extractYearFromText(m.angkatan) || String(m.angkatan || '');
      matchAngkatan = mhsYear === detectedYear || String(m.angkatan || '').includes(detectedYear);
    }

    return matchNameOrNim && matchAngkatan;
  });

  renderTable(filteredStudents);
}

// Render Table Rows Dynamically
function renderTable(students) {
  const tbody = document.getElementById('studentTableBody');
  const countLabel = document.getElementById('studentsCountLabel');
  if (!tbody) return;

  const portalKeys = Object.keys(globalPortalsConfig);
  const totalCols = 5 + portalKeys.length;

  countLabel.textContent = `Menampilkan ${students.length} dari ${allStudents.length} mahasiswa`;

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${totalCols}" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Tidak ditemukan mahasiswa yang sesuai dengan pencarian.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  students.forEach((m, idx) => {
    let portalCellsHtml = '';

    portalKeys.forEach((key) => {
      const pData = (m.portals && m.portals[key]) || { status: 'EMPTY' };
      const meta = STATUS_META[pData.status] || STATUS_META.EMPTY;
      const portalObj = globalPortalsConfig[key];
      const shortName = portalObj && portalObj.nama ? portalObj.nama.split(':')[0].trim() : key;
      const safeNote = escapeHtml(pData.catatanDosen || '');

      portalCellsHtml += `
        <td>
          <span class="badge-status badge-clickable ${meta.cls}" 
                onclick="openQuickStatusModal(${m.id}, '${escapeHtml(m.nama)}', '${key}', '${pData.status}', '${safeNote}')" 
                title="Klik untuk ubah status ${escapeHtml(shortName)} (${escapeHtml(m.nama)})"
                style="font-size: 0.68rem; padding: 0.25rem 0.6rem; display: inline-flex; align-items: center; gap: 0.3rem;">
            <i class="${meta.icon}"></i> ${meta.label} <i class="fa-solid fa-pen" style="font-size: 0.55rem; opacity: 0.7; margin-left: 2px;"></i>
          </span>
        </td>
      `;
    });

    const initials = getStudentInitials(m.nama);
    const hasPhoto = Boolean(m.fotoProfil);
    const avatarHtml = hasPhoto
      ? `<img src="${m.fotoProfil}" alt="${escapeHtml(m.nama)}" class="student-avatar-thumb" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #60a5fa; box-shadow: 0 2px 5px rgba(0,0,0,0.12); display: block;">`
      : `<div class="student-avatar-thumb" style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; border: 2px solid #93c5fd; box-shadow: 0 2px 5px rgba(0,0,0,0.12);">${initials}</div>`;

    html += `
      <tr>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div class="table-student-avatar-btn" 
                 onclick="openStudentPhotoLightbox(${m.id})" 
                 title="Klik untuk perbesar foto profil (${escapeHtml(m.nama)})">
              ${avatarHtml}
              <div class="avatar-zoom-pill" style="position: absolute; bottom: -2px; right: -2px; background: #2563eb; color: white; width: 14px; height: 14px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.48rem; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
                <i class="fa-solid fa-magnifying-glass-plus"></i>
              </div>
            </div>
            <div class="student-col-info">
              <span class="s-name" style="cursor: pointer;" onclick="openStudentPhotoLightbox(${m.id})" title="Klik untuk lihat foto profil">${escapeHtml(m.nama)}</span>
              <span class="s-meta">NIM: <strong>${escapeHtml(m.nim)}</strong></span>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size: 0.82rem; font-weight: 600;">Angkatan ${escapeHtml(m.angkatan)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(m.prodi || 'Teknik Informatika')}</div>
        </td>
        <td>
          <div style="font-size: 0.78rem; color: var(--text-main); line-height: 1.35; max-height: 48px; overflow: hidden; text-overflow: ellipsis;">
            ${m.judulSkripsi ? escapeHtml(m.judulSkripsi) : '<em style="color:#94a3b8;">Belum ada judul</em>'}
          </div>
        </td>
        ${portalCellsHtml}
        <td style="text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <button class="btn-view-berkas" onclick="openVerificationModal(${m.id})" title="Periksa Berkas & Drive">
              <i class="fa-solid fa-folder-open"></i> Periksa
            </button>
            <button class="btn-edit-student" onclick="openEditStudentModal(${m.id})" title="Edit Data Mahasiswa" style="padding: 0.4rem 0.65rem; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-delete-student" onclick="handleDeleteStudent(${m.id}, '${escapeHtml(m.nama)}')" title="Hapus dari Whitelist">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================================
// QUICK STATUS MODAL (KLIK LANGSUNG DARI TABEL)
// ==========================================
async function openQuickStatusModal(studentId, studentName, portalKey, currentStatus, currentNote) {
  const portal = globalPortalsConfig[portalKey] || { nama: portalKey };
  const portalTitle = portal.nama || portalKey;

  const initialStatus = currentStatus && currentStatus !== 'undefined' ? currentStatus : 'EMPTY';
  window.quickSelectedStatus = initialStatus;

  const { value: formValues } = await Swal.fire({
    title: `<div style="font-size: 1.15rem; color: #0d2346; font-weight: 800;"><i class="fa-solid fa-pen-to-square" style="color: #0284c7; margin-right: 0.35rem;"></i> Ubah Status Berkas</div>`,
    html: `
      <div style="text-align: left; font-size: 0.85rem;">
        <div style="background: #f8fafc; padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 1.25rem; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7;">
          <div style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${escapeHtml(studentName)}</div>
          <div style="font-size: 0.78rem; color: #475569; margin-top: 3px;">${escapeHtml(portalTitle)}</div>
        </div>

        <label style="font-weight: 700; color: #1e293b; display: block; margin-bottom: 0.6rem;">
          Pilih Status Keputusan:
        </label>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 1.25rem;" id="quickStatusBtnGroup">
          <button type="button" class="swal-status-btn" id="btnStatusApproved" onclick="selectQuickStatusOption('APPROVED', this)" style="padding: 0.65rem 0.5rem; border-radius: 8px; font-weight: 700; font-size: 0.78rem; cursor: pointer; border: 2px solid ${initialStatus === 'APPROVED' ? '#059669' : '#a7f3d0'}; background: ${initialStatus === 'APPROVED' ? '#d1fae5' : '#f0fdf4'}; color: #047857; display: flex; align-items: center; justify-content: center; gap: 0.4rem; transition: all 0.2s;">
            <i class="fa-solid fa-circle-check"></i> ACC / Disetujui
          </button>

          <button type="button" class="swal-status-btn" id="btnStatusPending" onclick="selectQuickStatusOption('PENDING', this)" style="padding: 0.65rem 0.5rem; border-radius: 8px; font-weight: 700; font-size: 0.78rem; cursor: pointer; border: 2px solid ${initialStatus === 'PENDING' ? '#d97706' : '#fde68a'}; background: ${initialStatus === 'PENDING' ? '#fef3c7' : '#fffbeb'}; color: #b45309; display: flex; align-items: center; justify-content: center; gap: 0.4rem; transition: all 0.2s;">
            <i class="fa-solid fa-hourglass-half"></i> Sedang Diproses
          </button>

          <button type="button" class="swal-status-btn" id="btnStatusRevision" onclick="selectQuickStatusOption('REVISION', this)" style="padding: 0.65rem 0.5rem; border-radius: 8px; font-weight: 700; font-size: 0.78rem; cursor: pointer; border: 2px solid ${initialStatus === 'REVISION' ? '#dc2626' : '#fecaca'}; background: ${initialStatus === 'REVISION' ? '#fee2e2' : '#fef2f2'}; color: #b91c1c; display: flex; align-items: center; justify-content: center; gap: 0.4rem; transition: all 0.2s;">
            <i class="fa-solid fa-triangle-exclamation"></i> Perlu Revisi
          </button>

          <button type="button" class="swal-status-btn" id="btnStatusEmpty" onclick="selectQuickStatusOption('EMPTY', this)" style="padding: 0.65rem 0.5rem; border-radius: 8px; font-weight: 700; font-size: 0.78rem; cursor: pointer; border: 2px solid ${initialStatus === 'EMPTY' ? '#64748b' : '#cbd5e1'}; background: ${initialStatus === 'EMPTY' ? '#e2e8f0' : '#f8fafc'}; color: #475569; display: flex; align-items: center; justify-content: center; gap: 0.4rem; transition: all 0.2s;">
            <i class="fa-regular fa-clock"></i> Belum Diisi
          </button>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-weight: 600; color: #334155; display: block; margin-bottom: 0.35rem; font-size: 0.8rem;">
            Catatan Dosen / Pesan Revisi:
          </label>
          <textarea id="swal-quick-catatan" class="swal2-textarea" style="width: 100%; margin: 0; box-sizing: border-box; font-size: 0.82rem; min-height: 65px; border-radius: 6px;" placeholder="Contoh: Berkas sudah lengkap dan valid... atau Mohon unggah ulang lembar perbaikan yang telah ditandatangani...">${escapeHtml(currentNote || '')}</textarea>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-paper-plane"></i> Simpan & Kirim Status',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#0d2346',
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const status = window.quickSelectedStatus || initialStatus;
      const catatanDosen = document.getElementById('swal-quick-catatan').value.trim();

      if (status === 'REVISION' && !catatanDosen) {
        Swal.showValidationMessage('Harap masukkan catatan perbaikan untuk status Revisi!');
        return false;
      }

      return { status, catatanDosen };
    }
  });

  if (!formValues) return;

  // 1. Optimistic Update Seketika: tabel langsung berubah detik itu juga
  const student = allStudents.find((s) => s.id === studentId);
  if (student && student.portals && student.portals[portalKey]) {
    student.portals[portalKey].status = formValues.status;
    student.portals[portalKey].catatanDosen = formValues.catatanDosen;
  }
  renderStudentTable();
  updateStatsCounters();

  // 2. Mini Toast Non-blocking (tidak ada modal popup besar yang memblokir layar)
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
  });
  Toast.fire({
    icon: 'success',
    title: `Status ${STATUS_META[formValues.status]?.label || formValues.status} terkirim real-time!`,
  });

  // 3. Kirim ke Server di background & broadcast via Socket.io
  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        mahasiswaId: studentId,
        portal: portalKey,
        status: formValues.status,
        catatanDosen: formValues.catatanDosen,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      loadStudents(false); // rollback jika gagal
      Toast.fire({
        icon: 'error',
        title: data.message || 'Gagal menyimpan verifikasi.',
      });
      return;
    }

    // Refresh background data
    loadStudents(false);
  } catch (err) {
    console.error(err);
    loadStudents(false);
    Toast.fire({
      icon: 'error',
      title: 'Koneksi gagal ke server.',
    });
  }
}

function selectQuickStatusOption(status, btnElement) {
  window.quickSelectedStatus = status;
  const allBtns = document.querySelectorAll('#quickStatusBtnGroup .swal-status-btn');
  allBtns.forEach((b) => {
    b.style.boxShadow = 'none';
    b.style.transform = 'none';
    b.style.borderWidth = '2px';
  });

  btnElement.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.4)';
  btnElement.style.transform = 'scale(1.03)';

  const catatanEl = document.getElementById('swal-quick-catatan');
  if (status === 'REVISION' && catatanEl) {
    catatanEl.focus();
  }
}

// ==========================================
// MODAL: EDIT MAHASISWA
// ==========================================
function openEditStudentModal(id) {
  const m = allStudents.find((s) => s.id === id);
  if (!m) return;

  document.getElementById('editStudentId').value = m.id;
  document.getElementById('editNim').value = m.nim;
  document.getElementById('editNama').value = m.nama;
  document.getElementById('editAngkatan').value = m.angkatan;
  document.getElementById('editProdi').value = m.prodi || 'Teknik Informatika';
  document.getElementById('editJudul').value = m.judulSkripsi || '';

  document.getElementById('editStudentModal').style.display = 'flex';
}

function closeEditStudentModal() {
  document.getElementById('editStudentModal').style.display = 'none';
}

async function handleUpdateStudent(event) {
  event.preventDefault();
  const id = document.getElementById('editStudentId').value;
  const nim = document.getElementById('editNim').value.trim();
  const nama = document.getElementById('editNama').value.trim();
  const angkatan = document.getElementById('editAngkatan').value.trim();
  const prodi = document.getElementById('editProdi').value.trim();
  const judulSkripsi = document.getElementById('editJudul').value.trim();
  const btn = document.getElementById('btnSubmitEditStudent');

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

  try {
    const res = await fetch(`/api/admin/mahasiswa/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nim, nama, angkatan, prodi, judulSkripsi }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Memperbarui',
        text: data.message || 'Gagal mengubah data mahasiswa.',
        confirmButtonColor: '#0d2346'
      });
      btn.disabled = false;
      btn.innerHTML = `<span>Simpan Perubahan</span>`;
      return;
    }

    closeEditStudentModal();
    btn.disabled = false;
    btn.innerHTML = `<span>Simpan Perubahan</span>`;
    loadStudents();

    Swal.fire({
      icon: 'success',
      title: 'Perubahan Tersimpan!',
      text: data.message,
      confirmButtonColor: '#164e87',
      timer: 2000,
      showConfirmButton: false
    });
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Terputus',
      text: 'Terjadi kesalahan koneksi ke server.',
      confirmButtonColor: '#0d2346'
    });
    btn.disabled = false;
    btn.innerHTML = `<span>Simpan Perubahan</span>`;
  }
}

// ==========================================
// MODAL: KELOLA PERSYARATAN BERKAS PORTAL
// ==========================================
async function openRequirementsModal() {
  try {
    const res = await fetch('/api/admin/portals-config', {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (data.success && data.portals) {
      globalPortalsConfig = data.portals;
      const keys = Object.keys(globalPortalsConfig);
      if (!keys.includes(activeReqPortalKey)) {
        activeReqPortalKey = keys[0] || 'PORTAL_1';
      }
      renderRequirementsTabs();
      renderRequirementsEditor();
      document.getElementById('requirementsModal').style.display = 'flex';
    }
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Memuat Persyaratan',
      text: 'Tidak dapat mengambil konfigurasi portal.',
      confirmButtonColor: '#0d2346'
    });
  }
}

function closeRequirementsModal() {
  document.getElementById('requirementsModal').style.display = 'none';
}

function renderRequirementsTabs() {
  const container = document.getElementById('reqPortalTabsContainer');
  if (!container) return;

  const keys = Object.keys(globalPortalsConfig);
  let html = '';

  keys.forEach((k) => {
    const p = globalPortalsConfig[k];
    const shortTitle = p && p.nama ? p.nama.split(':')[0].trim() : k;
    const isActive = k === activeReqPortalKey;
    html += `
      <button type="button" class="tab-btn ${isActive ? 'active' : ''}" onclick="switchReqPortal('${k}')">
        ${escapeHtml(shortTitle)}
      </button>
    `;
  });

  // Tombol "+ Tambah Portal Baru"
  html += `
    <button type="button" class="tab-btn" onclick="promptAddNewPortal()" style="background: #e0f2fe; color: #0284c7; border: 1px dashed #38bdf8; font-weight: 700;">
      <i class="fa-solid fa-plus"></i> Tambah Portal Baru
    </button>
  `;

  container.innerHTML = html;
}

function switchReqPortal(portalKey) {
  activeReqPortalKey = portalKey;
  renderRequirementsTabs();
  renderRequirementsEditor();
}

function renderRequirementsEditor() {
  const portal = globalPortalsConfig[activeReqPortalKey];
  const deleteBtn = document.getElementById('btnDeleteReqPortal');

  if (!portal) {
    document.getElementById('reqPortalName').value = '';
    document.getElementById('reqPortalDesc').value = '';
    document.getElementById('reqDocsContainer').innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Pilih atau buat portal terlebih dahulu.</p>';
    if (deleteBtn) deleteBtn.style.display = 'none';
    return;
  }

  if (deleteBtn) {
    deleteBtn.style.display = 'inline-flex';
  }

  document.getElementById('reqPortalName').value = portal.nama || '';
  document.getElementById('reqPortalDesc').value = portal.deskripsi || '';

  const container = document.getElementById('reqDocsContainer');
  container.innerHTML = (portal.berkas || [])
    .map(
      (b, idx) => `
    <div class="doc-req-item" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; color: #1e293b; font-size: 0.85rem;">
          <i class="fa-solid fa-file-lines" style="color: #0284c7; margin-right: 0.3rem;"></i> Dokumen #${idx + 1}
        </span>
        <button type="button" onclick="removeDocRequirementRow(this)" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.3rem 0.65rem; cursor: pointer; font-size: 0.75rem; font-weight: 600;" title="Hapus Dokumen">
          <i class="fa-solid fa-trash-can"></i> Hapus
        </button>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
        <div>
          <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.25rem;">
            Nama Syarat Dokumen *
          </label>
          <textarea class="auto-expand-textarea req-doc-name" rows="1" placeholder="Contoh: Kartu Logbook / Bukti Bimbingan" style="font-size: 0.82rem; padding: 0.45rem 0.65rem; min-height: 38px;">${escapeHtml(b.nama)}</textarea>
        </div>
        <div>
          <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.25rem;">
            Keterangan / Ketentuan Berkas
          </label>
          <textarea class="auto-expand-textarea req-doc-desc" rows="1" placeholder="Contoh: Telah disetujui tim pembimbing" style="font-size: 0.82rem; padding: 0.45rem 0.65rem; min-height: 38px;">${escapeHtml(b.keterangan)}</textarea>
        </div>
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <label style="font-size: 0.72rem; font-weight: 700; color: #0369a1;">
            <i class="fa-solid fa-file-signature"></i> Format Standar Nama File (Google Drive) *
          </label>
          <span style="font-size: 0.68rem; color: #64748b;">
            Gunakan <code>[NIM]</code> untuk nomor mahasiswa
          </span>
        </div>
        <input type="text" class="input-portal-single req-doc-format" value="${escapeHtml(b.formatContoh || `0${idx + 1}_${b.nama.replace(/[^a-zA-Z0-9]/g, '_')}_[NIM].pdf`)}" placeholder="Contoh: 0${idx + 1}_Dokumen_[NIM].pdf" style="font-size: 0.82rem; padding: 0.45rem 0.65rem; font-family: monospace; font-weight: 600; color: #0284c7; background: #ffffff; border-color: #bae6fd;">
      </div>
    </div>
  `
    )
    .join('');

  setTimeout(() => {
    container.querySelectorAll('.auto-expand-textarea').forEach(autoResizeTextarea);
  }, 30);
}

function addDocRequirementRow() {
  const container = document.getElementById('reqDocsContainer');
  const count = container.children.length + 1;
  const numPad = count < 10 ? `0${count}` : `${count}`;
  const div = document.createElement('div');
  div.className = 'doc-req-item';
  div.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;';
  div.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-weight: 700; color: #1e293b; font-size: 0.85rem;">
        <i class="fa-solid fa-file-lines" style="color: #0284c7; margin-right: 0.3rem;"></i> Dokumen #${count}
      </span>
      <button type="button" onclick="removeDocRequirementRow(this)" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.3rem 0.65rem; cursor: pointer; font-size: 0.75rem; font-weight: 600;" title="Hapus Dokumen">
        <i class="fa-solid fa-trash-can"></i> Hapus
      </button>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
      <div>
        <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.25rem;">
          Nama Syarat Dokumen *
        </label>
        <textarea class="auto-expand-textarea req-doc-name" rows="1" placeholder="Nama Dokumen Baru" style="font-size: 0.82rem; padding: 0.45rem 0.65rem; min-height: 38px;"></textarea>
      </div>
      <div>
        <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.25rem;">
          Keterangan / Ketentuan Berkas
        </label>
        <textarea class="auto-expand-textarea req-doc-desc" rows="1" placeholder="Keterangan / Ketentuan" style="font-size: 0.82rem; padding: 0.45rem 0.65rem; min-height: 38px;"></textarea>
      </div>
    </div>

    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
        <label style="font-size: 0.72rem; font-weight: 700; color: #0369a1;">
          <i class="fa-solid fa-file-signature"></i> Format Standar Nama File (Google Drive) *
        </label>
        <span style="font-size: 0.68rem; color: #64748b;">
          Gunakan <code>[NIM]</code> untuk nomor mahasiswa
        </span>
      </div>
      <input type="text" class="input-portal-single req-doc-format" value="${numPad}_Dokumen_Baru_[NIM].pdf" placeholder="Contoh: ${numPad}_Dokumen_Baru_[NIM].pdf" style="font-size: 0.82rem; padding: 0.45rem 0.65rem; font-family: monospace; font-weight: 600; color: #0284c7; background: #ffffff; border-color: #bae6fd;">
    </div>
  `;
  container.appendChild(div);
  setTimeout(() => {
    div.querySelectorAll('.auto-expand-textarea').forEach(autoResizeTextarea);
  }, 30);
}

function removeDocRequirementRow(btn) {
  const row = btn.closest('.doc-req-item');
  if (row) row.remove();
}

// Modal dialog untuk menambah Portal Baru
async function promptAddNewPortal() {
  const nextNumber = Object.keys(globalPortalsConfig).length + 1;

  const { value: formValues } = await Swal.fire({
    title: '<i class="fa-solid fa-folder-plus" style="color:#0284c7;"></i> Tambah Portal Baru',
    html: `
      <div style="text-align: left; font-size: 0.85rem;">
        <p style="color: #64748b; margin-bottom: 1rem;">
          Buat tahapan portal skripsi baru. Mahasiswa akan langsung dapat mengunggah berkas untuk tahapan ini.
        </p>
        <div style="margin-bottom: 0.75rem;">
          <label style="font-weight: 600; display: block; margin-bottom: 0.3rem;">Nama Tahapan Portal *</label>
          <input id="swal-portal-name" class="swal2-input" placeholder="Contoh: Portal ${nextNumber}: Pendaftaran Ujian Tutup / Yudisium" style="width: 100%; margin: 0; box-sizing: border-box; font-size: 0.85rem;" value="Portal ${nextNumber}: ">
        </div>
        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 0.3rem;">Deskripsi / Petunjuk Tahapan</label>
          <textarea id="swal-portal-desc" class="swal2-textarea" placeholder="Contoh: Pengumpulan berkas persyaratan sebelum penetapan kelulusan..." style="width: 100%; margin: 0; box-sizing: border-box; font-size: 0.85rem; min-height: 70px;"></textarea>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-plus"></i> Tambahkan Portal',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#0d2346',
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const nama = document.getElementById('swal-portal-name').value.trim();
      const deskripsi = document.getElementById('swal-portal-desc').value.trim();
      if (!nama) {
        Swal.showValidationMessage('Nama tahapan portal wajib diisi!');
        return false;
      }
      return { nama, deskripsi };
    }
  });

  if (!formValues) return;

  try {
    const res = await fetch('/api/admin/portals-config', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(formValues),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menambah Portal',
        text: data.message || 'Terjadi kesalahan.',
        confirmButtonColor: '#0d2346'
      });
      return;
    }

    globalPortalsConfig = data.portals;
    activeReqPortalKey = data.portalKey;

    renderRequirementsTabs();
    renderRequirementsEditor();
    loadStudents(false);

    Swal.fire({
      icon: 'success',
      title: 'Portal Berhasil Dibuat!',
      text: `${data.portal.nama} telah ditambahkan. Anda sekarang dapat menambahkan syarat dokumen di bawah ini.`,
      confirmButtonColor: '#164e87',
      timer: 2500,
      showConfirmButton: false
    });
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat menambahkan portal ke server.',
      confirmButtonColor: '#0d2346'
    });
  }
}

// Hapus Portal yang sedang aktif di modal
async function handleDeleteCurrentPortal() {
  const portal = globalPortalsConfig[activeReqPortalKey];
  if (!portal) return;

  const result = await Swal.fire({
    title: `Hapus ${portal.nama}?`,
    text: `Tahapan portal ini beserta seluruh syarat dokumennya akan dihapus dari sistem.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="fa-solid fa-trash"></i> Ya, Hapus Portal',
    cancelButtonText: 'Batal'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/admin/portals-config/${activeReqPortalKey}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menghapus',
        text: data.message || 'Gagal menghapus portal.',
        confirmButtonColor: '#0d2346'
      });
      return;
    }

    globalPortalsConfig = data.portals;
    const remainingKeys = Object.keys(globalPortalsConfig);
    activeReqPortalKey = remainingKeys[0] || '';

    renderRequirementsTabs();
    renderRequirementsEditor();
    loadStudents(false);

    Swal.fire({
      icon: 'success',
      title: 'Portal Dihapus',
      text: data.message,
      timer: 2000,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat menghubungi server.',
      confirmButtonColor: '#0d2346'
    });
  }
}

// Simpan Persyaratan Portal
async function savePortalRequirements() {
  const nama = document.getElementById('reqPortalName').value.trim();
  const deskripsi = document.getElementById('reqPortalDesc').value.trim();
  const docRows = document.querySelectorAll('#reqDocsContainer .doc-req-item');

  if (!nama) {
    Swal.fire({
      icon: 'warning',
      title: 'Nama Portal Wajib Diisi',
      text: 'Silakan isi nama tahapan portal.',
      confirmButtonColor: '#0d2346'
    });
    return;
  }

  const berkas = [];
  docRows.forEach((r, idx) => {
    const docName = r.querySelector('.req-doc-name').value.trim();
    const docDesc = r.querySelector('.req-doc-desc').value.trim();
    const docFormatInput = r.querySelector('.req-doc-format');
    const docFormat = docFormatInput ? docFormatInput.value.trim() : '';

    if (docName) {
      berkas.push({
        nomor: idx + 1,
        nama: docName,
        keterangan: docDesc,
        formatContoh: docFormat || `0${idx + 1}_${docName.replace(/[^a-zA-Z0-9]/g, '_')}_[NIM].pdf`
      });
    }
  });

  const saveBtn = document.getElementById('btnSaveReqPortal');
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

  try {
    const res = await fetch(`/api/admin/portals-config/${activeReqPortalKey}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nama, deskripsi, berkas }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: data.message || 'Gagal menyimpan persyaratan.',
        confirmButtonColor: '#0d2346'
      });
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan Persyaratan Portal</span>`;
      return;
    }

    globalPortalsConfig[activeReqPortalKey] = data.portal;
    renderRequirementsTabs();
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan Persyaratan Portal</span>`;
    loadStudents(false);

    Swal.fire({
      icon: 'success',
      title: 'Persyaratan Diperbarui!',
      text: `Daftar syarat berkas untuk ${data.portal.nama} telah diperbarui dan langsung tampil di portal mahasiswa.`,
      confirmButtonColor: '#164e87'
    });
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Gagal menyimpan ke server.',
      confirmButtonColor: '#0d2346'
    });
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan Persyaratan Portal</span>`;
  }
}

// ==========================================
// MODAL: TAMBAH MAHASISWA KE WHITELIST
// ==========================================
function openAddStudentModal() {
  document.getElementById('formAddStudent').reset();
  document.getElementById('addStudentModal').style.display = 'flex';
}

function closeAddStudentModal() {
  document.getElementById('addStudentModal').style.display = 'none';
}

async function handleCreateStudent(event) {
  event.preventDefault();
  const nim = document.getElementById('newNim').value.trim();
  const nama = document.getElementById('newNama').value.trim();
  const angkatan = document.getElementById('newAngkatan').value.trim();
  const prodi = document.getElementById('newProdi').value.trim();
  const judulSkripsi = document.getElementById('newJudul').value.trim();
  const btn = document.getElementById('btnSubmitNewStudent');

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan ke Whitelist...`;

  try {
    const res = await fetch('/api/admin/mahasiswa', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nim, nama, angkatan, prodi, judulSkripsi }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menambahkan',
        text: data.message || 'Gagal menambahkan mahasiswa.',
        confirmButtonColor: '#0d2346'
      });
      btn.disabled = false;
      btn.innerHTML = `<span>Aktivasi Whitelist Mahasiswa</span>`;
      return;
    }

    closeAddStudentModal();
    btn.disabled = false;
    btn.innerHTML = `<span>Aktivasi Whitelist Mahasiswa</span>`;
    loadStudents();

    Swal.fire({
      icon: 'success',
      title: 'Berhasil Terdaftar!',
      text: data.message,
      confirmButtonColor: '#164e87',
      timer: 2500,
      showConfirmButton: false
    });
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Terputus',
      text: 'Terjadi kesalahan koneksi ke server.',
      confirmButtonColor: '#0d2346'
    });
    btn.disabled = false;
    btn.innerHTML = `<span>Aktivasi Whitelist Mahasiswa</span>`;
  }
}

// Delete student from whitelist
async function handleDeleteStudent(id, name) {
  const result = await Swal.fire({
    title: 'Hapus dari Whitelist?',
    text: `Mahasiswa ${name} tidak akan bisa login lagi ke portal setelah dihapus.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="fa-solid fa-trash"></i> Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/admin/mahasiswa/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (res.ok) {
      loadStudents();
      Swal.fire({
        icon: 'success',
        title: 'Berhasil Dihapus',
        text: `Data mahasiswa ${name} telah dihapus dari whitelist.`,
        timer: 2000,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menghapus',
        text: data.message || 'Gagal menghapus mahasiswa.',
        confirmButtonColor: '#0d2346'
      });
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat terhubung ke server.',
      confirmButtonColor: '#0d2346'
    });
  }
}

// ==========================================
// MODAL: IN-APP PREVIEW & VERIFIKASI DOSEN
// ==========================================
async function openVerificationModal(studentId, switchTabToFirst = true) {
  try {
    const res = await fetch(`/api/admin/mahasiswa/${studentId}/berkas`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Gagal mengambil detail');

    const data = await res.json();
    currentViewingStudent = data.mahasiswa;
    currentViewingPortals = data.portals || [];

    // Header info
    document.getElementById('vModalStudentTitle').textContent = `Periksa Berkas: ${currentViewingStudent.nama}`;
    document.getElementById('vModalStudentMeta').textContent = `NIM: ${currentViewingStudent.nim} • Angkatan: ${currentViewingStudent.angkatan} • ${currentViewingStudent.prodi}`;

    const portalKeys = currentViewingPortals.map((p) => p.id);
    if (switchTabToFirst || !portalKeys.includes(activePortalKey)) {
      activePortalKey = portalKeys[0] || 'PORTAL_1';
    }

    renderVerificationTabs();
    renderActiveVerificationPortal();
    document.getElementById('verificationModal').style.display = 'flex';
  } catch (err) {
    console.error(err);
    alert('Gagal memuat berkas mahasiswa.');
  }
}

function closeVerificationModal() {
  document.getElementById('verificationModal').style.display = 'none';
  currentViewingStudent = null;
  currentViewingPortals = [];
  selectedDecision = null;
}

function renderVerificationTabs() {
  const container = document.getElementById('vPortalTabsContainer');
  if (!container) return;

  let html = '';
  currentViewingPortals.forEach((p) => {
    const shortTitle = p && p.nama ? p.nama.split(':')[0].trim() : p.id;
    const isActive = p.id === activePortalKey;
    html += `
      <button type="button" class="tab-btn ${isActive ? 'active' : ''}" onclick="switchVerificationPortal('${p.id}')">
        ${escapeHtml(shortTitle)}
      </button>
    `;
  });

  container.innerHTML = html;
}

function switchVerificationPortal(portalKey) {
  activePortalKey = portalKey;
  renderVerificationTabs();
  renderActiveVerificationPortal();
}

function renderActiveVerificationPortal() {
  const portal = currentViewingPortals.find((p) => p.id === activePortalKey);
  if (!portal) return;

  const sub = portal.submission || {};
  const statusKey = sub.status || 'EMPTY';
  const meta = STATUS_META[statusKey] || STATUS_META.EMPTY;

  // Portal title & description
  document.getElementById('vCurrentPortalName').textContent = portal.nama;
  document.getElementById('vCurrentPortalDesc').textContent = portal.deskripsi;

  // Badge Status
  const badgeEl = document.getElementById('vCurrentStatusBadge');
  badgeEl.className = `badge-status ${meta.cls}`;
  badgeEl.innerHTML = `<i class="${meta.icon}"></i> ${meta.label}`;

  // Checklist Berkas
  const checklistEl = document.getElementById('vChecklistDocs');
  checklistEl.innerHTML = (portal.berkas || [])
    .map(
      (b) => `
    <li style="display: flex; align-items: flex-start; gap: 0.4rem;">
      <i class="fa-solid fa-file-pdf" style="color: #dc2626; margin-top: 2px;"></i>
      <div>
        <strong>${b.nomor}. ${escapeHtml(b.nama)}</strong>
        <span style="display:block; color: var(--text-muted); font-size: 0.7rem;">(${escapeHtml(b.keterangan)})</span>
      </div>
    </li>
  `
    )
    .join('');

  // Pre-fill Catatan Dosen
  document.getElementById('vCatatanDosen').value = sub.catatanDosen || '';

  // Decision buttons
  setDecision(sub.status === 'APPROVED' ? 'APPROVED' : sub.status === 'REVISION' ? 'REVISION' : null);

  // In-App Preview Frame Setup
  const iframe = document.getElementById('previewIframe');
  const emptyPlaceholder = document.getElementById('previewEmptyPlaceholder');
  const externalLink = document.getElementById('previewExternalLink');

  if (sub.driveUrl && sub.driveUrl.trim()) {
    const rawUrl = sub.driveUrl.trim();
    externalLink.href = rawUrl;
    externalLink.style.display = 'inline-flex';

    // Konversi Google Drive URL ke embed preview
    const embedUrl = convertGoogleDriveUrlToEmbed(rawUrl);
    iframe.src = embedUrl;
    iframe.style.display = 'block';
    emptyPlaceholder.style.display = 'none';
  } else {
    externalLink.style.display = 'none';
    iframe.style.display = 'none';
    iframe.src = 'about:blank';
    emptyPlaceholder.style.display = 'flex';
  }
}

// Konverter URL Google Drive ke mode Preview responsif
function convertGoogleDriveUrlToEmbed(url) {
  try {
    const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
    }

    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch && fileMatch[1]) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }

    const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return `https://drive.google.com/embeddedfolderview?id=${idMatch[1]}#grid`;
    }

    return url;
  } catch (e) {
    return url;
  }
}

// Decision button toggle
function setDecision(decision) {
  selectedDecision = decision;
  const btnAcc = document.getElementById('btnDecisionAcc');
  const btnRev = document.getElementById('btnDecisionRev');

  if (decision === 'APPROVED') {
    btnAcc.classList.add('active');
    btnRev.classList.remove('active');
  } else if (decision === 'REVISION') {
    btnRev.classList.add('active');
    btnAcc.classList.remove('active');
  } else {
    btnAcc.classList.remove('active');
    btnRev.classList.remove('active');
  }
}

// Simpan Hasil Verifikasi
async function saveVerificationAction() {
  if (!selectedDecision) {
    Swal.fire({
      icon: 'info',
      title: 'Pilih Keputusan',
      text: 'Silakan pilih salah satu keputusan: "Setujui (ACC)" atau "Minta Perbaikan (Revisi)".',
      confirmButtonColor: '#0d2346'
    });
    return;
  }

  const catatanDosen = document.getElementById('vCatatanDosen').value.trim();
  if (selectedDecision === 'REVISION' && !catatanDosen) {
    Swal.fire({
      icon: 'warning',
      title: 'Catatan Diperlukan',
      text: 'Harap masukkan catatan perbaikan untuk mahasiswa agar mereka tahu apa yang perlu diperbaiki.',
      confirmButtonColor: '#0d2346'
    });
    document.getElementById('vCatatanDosen').focus();
    return;
  }

  const btn = document.getElementById('btnSaveVerification');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Keputusan...`;

  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        mahasiswaId: currentViewingStudent.id,
        portal: activePortalKey,
        status: selectedDecision,
        catatanDosen,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: data.message || 'Gagal menyimpan verifikasi.',
        confirmButtonColor: '#0d2346'
      });
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Simpan & Kirim Verifikasi</span>`;
      return;
    }

    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Tersimpan & Terkirim Real-Time!</span>`;

    // Perbarui data lokal
    const portal = currentViewingPortals.find((p) => p.id === activePortalKey);
    if (portal) {
      portal.submission = data.submission;
    }
    renderActiveVerificationPortal();

    // Perbarui tabel direktori
    loadStudents(false);

    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 1500,
      timerProgressBar: true,
    });
    Toast.fire({
      icon: 'success',
      title: 'Keputusan verifikasi tersimpan & terkirim real-time!',
    });

    setTimeout(() => {
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Simpan & Kirim Verifikasi</span>`;
    }, 2000);
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat terhubung ke server.',
      confirmButtonColor: '#0d2346'
    });
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Simpan & Kirim Verifikasi</span>`;
  }
}

// Logout Dosen
async function handleAdminLogout() {
  const result = await Swal.fire({
    title: 'Keluar dari Portal?',
    text: 'Sesi monitoring dosen Anda akan diakhiri.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0d2346',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Keluar',
    cancelButtonText: 'Batal'
  });

  if (!result.isConfirmed) return;

  try {
    localStorage.removeItem('token');
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
  } catch (err) {
    window.location.href = '/index.html';
  }
}

// Escape HTML utility
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ══════════════════════════════════════════════════════════════
// ADMIN TAB SWITCHER
// ══════════════════════════════════════════════════════════════
function switchAdminTab(tabName) {
  const btnStudents = document.getElementById('tabBtnStudents');
  const btnJadwal = document.getElementById('tabBtnJadwal');
  const btnSiteConfig = document.getElementById('tabBtnSiteConfig');

  const viewStudents = document.getElementById('tabViewStudents');
  const viewJadwal = document.getElementById('tabViewJadwal');
  const viewSiteConfig = document.getElementById('tabViewSiteConfig');

  if (btnStudents) btnStudents.classList.remove('active');
  if (btnJadwal) btnJadwal.classList.remove('active');
  if (btnSiteConfig) btnSiteConfig.classList.remove('active');

  if (viewStudents) viewStudents.style.display = 'none';
  if (viewJadwal) viewJadwal.style.display = 'none';
  if (viewSiteConfig) viewSiteConfig.style.display = 'none';

  if (tabName === 'students') {
    if (btnStudents) btnStudents.classList.add('active');
    if (viewStudents) viewStudents.style.display = 'block';
  } else if (tabName === 'jadwal') {
    if (btnJadwal) btnJadwal.classList.add('active');
    if (viewJadwal) viewJadwal.style.display = 'block';
    loadJadwalAdmin();
  } else if (tabName === 'siteconfig') {
    if (btnSiteConfig) btnSiteConfig.classList.add('active');
    if (viewSiteConfig) viewSiteConfig.style.display = 'block';
    loadSiteConfigAdmin();
    setTimeout(() => {
      document.querySelectorAll('#formSiteConfig .auto-expand-textarea').forEach(autoResizeTextarea);
      syncPovLive();
    }, 80);
  }
}

// ══════════════════════════════════════════════════════════════
// MANAJEMEN JADWAL UJIAN & WISUDA
// ══════════════════════════════════════════════════════════════
function rebuildJadwalTypesMap() {
  globalJadwalTypesMap = {};
  globalJadwalTypes.forEach((t) => {
    globalJadwalTypesMap[t.id] = t;
  });
}
rebuildJadwalTypesMap();

function populateJadwalJenisDropdown(selectedVal = null) {
  const select = document.getElementById('jadwalJenisSelect');
  if (!select) return;

  const currentVal = selectedVal || select.value;
  select.innerHTML = globalJadwalTypes.map((t) => {
    const isSel = (t.id === currentVal) ? 'selected' : '';
    return `<option value="${t.id}" ${isSel}>${escapeHtml(t.nama)}</option>`;
  }).join('');

  if (selectedVal) {
    select.value = selectedVal;
  }
}

// Populate Dropdown Mahasiswa di Modal Jadwal
function populateJadwalMhsDropdown(selectedId = null) {
  const select = document.getElementById('jadwalMhsSelect');
  if (!select) return;

  select.innerHTML = '<option value="">-- Pilih Mahasiswa Bimbingan --</option>';
  allStudents.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.nama} (${m.nim}) - ${m.prodi || 'Psikologi'}`;
    if (selectedId && Number(selectedId) === Number(m.id)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

// Load Jadwal dari Server (Delegated to High-Speed Bootstrap)
async function loadJadwalAdmin(showLoading = false) {
  return fetchAdminBootstrap(showLoading);
}

// Render Tabel Jadwal
function renderJadwalTable(jadwalList) {
  const tbody = document.getElementById('jadwalTableBody');
  if (!tbody) return;

  if (jadwalList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fa-regular fa-calendar-xmark fa-2x" style="margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
          Belum ada agenda jadwal yang ditambahkan. Klik tombol "Tambah Jadwal Ujian" atau "Jadwal Wisuda" di atas untuk membuat jadwal baru.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = jadwalList.map((j, idx) => {
    const tgl = new Date(j.tanggal).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    let statusBadgeCls = 'badge-PENDING';
    if (j.status === 'SELESAI') statusBadgeCls = 'badge-APPROVED';
    if (j.status === 'BATAL') statusBadgeCls = 'badge-REVISION';

    const typeObj = globalJadwalTypesMap[j.jenis];
    const typeName = typeObj ? typeObj.nama : j.jenis;
    const badgeStyle = typeObj && typeObj.badgeColor
      ? `background: ${typeObj.badgeBg || '#e0f2fe'}; color: ${typeObj.badgeColor || '#0369a1'}; border: 1px solid rgba(0,0,0,0.08);`
      : '';

    return `
      <tr>
        <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
        <td>
          <div style="font-weight: 700; color: var(--primary-navy); font-size: 0.92rem;">
            ${escapeHtml(j.mahasiswa?.nama || '-')}
          </div>
          <div style="font-size: 0.78rem; color: #64748b; font-family: monospace;">
            NIM: ${escapeHtml(j.mahasiswa?.nim || '-')} • ${escapeHtml(j.mahasiswa?.prodi || 'Psikologi')}
          </div>
        </td>
        <td>
          <span class="badge-exam badge-exam-${j.jenis}" style="${badgeStyle}">
            ${j.jenis === 'WISUDA' ? '<i class="fa-solid fa-graduation-cap" style="margin-right: 2px;"></i>' : ''}
            ${escapeHtml(typeName)}
          </span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--primary-navy); font-size: 0.85rem;">${tgl}</div>
          <div style="font-size: 0.78rem; color: #64748b;"><i class="fa-regular fa-clock"></i> ${escapeHtml(j.jam)}</div>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: 500; color: var(--text-main);"><i class="fa-solid fa-door-open" style="color: var(--primary-blue);"></i> ${escapeHtml(j.ruangan)}</div>
        </td>
        <td>
          <span class="badge-status ${statusBadgeCls}">${j.status}</span>
        </td>
        <td>
          <div style="font-size: 0.8rem; color: var(--text-muted); max-width: 220px;">
            ${j.catatan ? escapeHtml(j.catatan) : '<em style="color:#cbd5e1;">-</em>'}
          </div>
        </td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
            <button class="btn-action-icon" title="Edit Jadwal" onclick="openEditJadwalModal(${j.id})">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-action-icon btn-action-delete" title="Hapus Jadwal" onclick="handleDeleteJadwal(${j.id}, '${escapeHtml(j.mahasiswa?.nama || '')}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Buka Modal Tambah Jadwal (Mendukung Wisuda & Jenis Ujian Lainnya)
function openAddJadwalModal(defaultJenis = null) {
  const form = document.getElementById('formJadwal');
  if (form) form.reset();

  const title = document.getElementById('jadwalModalTitle');
  const editId = document.getElementById('jadwalEditId');
  if (editId) editId.value = '';

  const selectMhs = document.getElementById('jadwalMhsSelect');
  if (selectMhs) selectMhs.disabled = false;

  populateJadwalMhsDropdown();
  populateJadwalJenisDropdown(defaultJenis || (globalJadwalTypes[0] ? globalJadwalTypes[0].id : 'SEMPRO'));

  const inputRuangan = document.getElementById('jadwalRuanganInput');
  const inputJam = document.getElementById('jadwalJamInput');
  const inputCatatan = document.getElementById('jadwalCatatanInput');

  if (defaultJenis === 'WISUDA') {
    if (title) title.innerHTML = `<i class="fa-solid fa-graduation-cap" style="color: #a855f7;"></i> Penjadwalan Wisuda Mahasiswa`;
    if (inputRuangan) inputRuangan.placeholder = 'Contoh: Balai Sidang 45 Universitas Bosowa / Auditorium Phinisi';
    if (inputJam) inputJam.placeholder = 'Contoh: 08:00 - Selesai WITA';
    if (inputCatatan) inputCatatan.placeholder = 'Contoh: Mahasiswa wajib hadir 30 menit sebelum gladi bersih & mengenakan toga.';
  } else {
    if (title) title.innerHTML = `<i class="fa-regular fa-calendar-plus"></i> Tambah Jadwal Ujian`;
    if (inputRuangan) inputRuangan.placeholder = 'Contoh: Ruang Sidang Psikologi Gedung B Lt. 2';
    if (inputJam) inputJam.placeholder = 'Contoh: 09:00 - 11:00 WITA';
    if (inputCatatan) inputCatatan.placeholder = 'Contoh: Membawa naskah fisik rangkap 4.';
  }

  const modal = document.getElementById('jadwalModal');
  if (modal) modal.style.display = 'flex';
}

// Buka Modal Edit Jadwal
function openEditJadwalModal(id) {
  const j = allJadwalList.find((item) => item.id === id);
  if (!j) return;

  const isWisuda = (j.jenis === 'WISUDA');
  const title = document.getElementById('jadwalModalTitle');
  if (title) {
    title.innerHTML = isWisuda
      ? `<i class="fa-solid fa-graduation-cap" style="color: #a855f7;"></i> Edit Jadwal Wisuda`
      : `<i class="fa-solid fa-calendar-check"></i> Edit Jadwal Ujian`;
  }

  const editId = document.getElementById('jadwalEditId');
  if (editId) editId.value = j.id;

  populateJadwalMhsDropdown(j.mahasiswaId);

  const selectMhs = document.getElementById('jadwalMhsSelect');
  if (selectMhs) selectMhs.disabled = true;

  populateJadwalJenisDropdown(j.jenis);

  const selectStatus = document.getElementById('jadwalStatusSelect');
  if (selectStatus) selectStatus.value = j.status;

  const inputTanggal = document.getElementById('jadwalTanggalInput');
  if (inputTanggal) {
    const d = new Date(j.tanggal);
    inputTanggal.value = d.toISOString().split('T')[0];
  }

  const inputJam = document.getElementById('jadwalJamInput');
  if (inputJam) inputJam.value = j.jam;

  const inputRuangan = document.getElementById('jadwalRuanganInput');
  if (inputRuangan) inputRuangan.value = j.ruangan;

  const inputCatatan = document.getElementById('jadwalCatatanInput');
  if (inputCatatan) inputCatatan.value = j.catatan || '';

  const modal = document.getElementById('jadwalModal');
  if (modal) modal.style.display = 'flex';
}

function closeJadwalModal() {
  const modal = document.getElementById('jadwalModal');
  if (modal) modal.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// KELOLA & EDIT OPSI PILIHAN JADWAL & WISUDA
// ══════════════════════════════════════════════════════════════
let workingJadwalTypes = [];

function openManageJadwalTypesModal() {
  workingJadwalTypes = JSON.parse(JSON.stringify(globalJadwalTypes));
  renderJadwalTypesEditor();
  const modal = document.getElementById('manageJadwalTypesModal');
  if (modal) modal.style.display = 'flex';
}

function closeManageJadwalTypesModal() {
  const modal = document.getElementById('manageJadwalTypesModal');
  if (modal) modal.style.display = 'none';
}

function renderJadwalTypesEditor() {
  const container = document.getElementById('jadwalTypesListContainer');
  if (!container) return;

  const colorPresets = [
    { key: 'blue', label: 'Biru (Sempro)', badgeColor: '#0369a1', badgeBg: '#e0f2fe' },
    { key: 'amber', label: 'Kuning Amber (Semhas)', badgeColor: '#b45309', badgeBg: '#fef3c7' },
    { key: 'green', label: 'Hijau (Sidang)', badgeColor: '#15803d', badgeBg: '#dcfce7' },
    { key: 'purple', label: 'Ungu (Wisuda)', badgeColor: '#7e22ce', badgeBg: '#f3e8ff' },
    { key: 'rose', label: 'Merah Muda', badgeColor: '#be123c', badgeBg: '#ffe4e6' },
  ];

  container.innerHTML = workingJadwalTypes.map((t, idx) => {
    const colorOpts = colorPresets.map((c) => {
      const isSel = (c.badgeColor === t.badgeColor) ? 'selected' : '';
      return `<option value="${c.key}" data-color="${c.badgeColor}" data-bg="${c.badgeBg}" ${isSel}>${c.label}</option>`;
    }).join('');

    return `
      <div class="jadwal-type-item" style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.6rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-family: monospace; font-weight: 800; font-size: 0.78rem; background: #07152b; color: #93c5fd; padding: 0.2rem 0.55rem; border-radius: 5px; letter-spacing: 0.5px;">
              ${escapeHtml(t.id)}
            </span>
            <span style="font-size: 0.75rem; color: #64748b;">(Opsi ${idx + 1})</span>
          </div>
          <button type="button" onclick="removeJadwalTypeRow(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.78rem; font-weight: 600; padding: 0.2rem 0.4rem; display: inline-flex; align-items: center; gap: 0.25rem; border-radius: 4px;" title="Hapus opsi ini" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">
            <i class="fa-solid fa-trash-can"></i> Hapus
          </button>
        </div>

        <div>
          <label style="font-size: 0.75rem; font-weight: 700; color: var(--primary-navy); margin-bottom: 0.25rem; display: block;">
            Teks Narasi / Label Pilihan:
          </label>
          <input type="text" class="input-portal-single" id="jtype_nama_${idx}" value="${escapeHtml(t.nama)}" placeholder="Contoh: Seminar Proposal (Sempro)" style="font-size: 0.85rem; padding: 0.5rem 0.75rem; background: #f8fafc; font-weight: 600;" oninput="syncJadwalTypeNama(${idx}, this.value)">
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 0.73rem; color: #64748b; font-weight: 600;">Warna Badge:</span>
            <select class="input-portal-single" style="font-size: 0.75rem; padding: 0.3rem 0.6rem; width: auto;" onchange="updateJadwalTypeColor(${idx}, this)">
              ${colorOpts}
            </select>
          </div>
          <span class="badge-exam" id="jtype_preview_${idx}" style="background: ${t.badgeBg || '#e0f2fe'}; color: ${t.badgeColor || '#0369a1'}; border: 1px solid rgba(0,0,0,0.08);">
            ${escapeHtml(t.nama || t.id)}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function syncJadwalTypeNama(idx, val) {
  if (workingJadwalTypes[idx]) {
    workingJadwalTypes[idx].nama = val;
    const preview = document.getElementById(`jtype_preview_${idx}`);
    if (preview) {
      preview.textContent = val || workingJadwalTypes[idx].id;
    }
  }
}

function updateJadwalTypeColor(idx, selectEl) {
  const selectedOpt = selectEl.options[selectEl.selectedIndex];
  if (!selectedOpt || !workingJadwalTypes[idx]) return;
  const color = selectedOpt.getAttribute('data-color');
  const bg = selectedOpt.getAttribute('data-bg');
  workingJadwalTypes[idx].badgeColor = color;
  workingJadwalTypes[idx].badgeBg = bg;
  const preview = document.getElementById(`jtype_preview_${idx}`);
  if (preview) {
    preview.style.background = bg;
    preview.style.color = color;
  }
}

function addNewJadwalTypeRow() {
  Swal.fire({
    title: 'Tambah Opsi Jadwal Baru',
    html: `
      <div style="text-align: left; display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0;">
        <div>
          <label style="font-size: 0.8rem; font-weight: 700; color: #1e3a8a; display: block; margin-bottom: 0.25rem;">Kode Singkat (HURUF BESAR, tanpa spasi):</label>
          <input type="text" id="swalNewTypeCode" class="swal2-input" placeholder="Contoh: YUDISIUM" style="margin: 0; width: 100%; box-sizing: border-box; text-transform: uppercase;">
        </div>
        <div>
          <label style="font-size: 0.8rem; font-weight: 700; color: #1e3a8a; display: block; margin-bottom: 0.25rem;">Teks Narasi Pilihan:</label>
          <input type="text" id="swalNewTypeName" class="swal2-input" placeholder="Contoh: Yudisium Kelulusan Sarjana" style="margin: 0; width: 100%; box-sizing: border-box;">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Tambahkan Opsi',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#0d2346',
    preConfirm: () => {
      const code = document.getElementById('swalNewTypeCode').value.trim().toUpperCase().replace(/\s+/g, '_');
      const name = document.getElementById('swalNewTypeName').value.trim();
      if (!code || !name) {
        Swal.showValidationMessage('Kode dan Teks Narasi wajib diisi.');
        return false;
      }
      if (workingJadwalTypes.some((t) => t.id === code)) {
        Swal.showValidationMessage(`Kode "${code}" sudah terdaftar.`);
        return false;
      }
      return { id: code, nama: name };
    },
  }).then((res) => {
    if (res.isConfirmed && res.value) {
      workingJadwalTypes.push({
        id: res.value.id,
        nama: res.value.nama,
        badgeColor: '#7e22ce',
        badgeBg: '#f3e8ff',
      });
      renderJadwalTypesEditor();
    }
  });
}

function removeJadwalTypeRow(idx) {
  const item = workingJadwalTypes[idx];
  if (!item) return;

  Swal.fire({
    title: `Hapus Opsi "${item.nama}"?`,
    text: 'Opsi ini tidak akan lagi muncul dalam pilihan dropdown penjadwalan.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus Opsi',
    cancelButtonText: 'Batal',
  }).then((res) => {
    if (res.isConfirmed) {
      workingJadwalTypes.splice(idx, 1);
      renderJadwalTypesEditor();
    }
  });
}

async function handleSaveJadwalTypes() {
  const btn = document.getElementById('btnSaveJadwalTypes');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  // Ambil nilai terkini dari input
  workingJadwalTypes.forEach((t, idx) => {
    const input = document.getElementById(`jtype_nama_${idx}`);
    if (input && input.value.trim()) {
      t.nama = input.value.trim();
    }
  });

  try {
    const res = await fetch('/api/admin/jadwal/types', {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ types: workingJadwalTypes }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal menyimpan opsi jadwal.');
    }

    globalJadwalTypes = data.types || workingJadwalTypes;
    rebuildJadwalTypesMap();
    populateJadwalJenisDropdown();
    renderJadwalTable(allJadwalList);

    closeManageJadwalTypesModal();

    Swal.fire({
      icon: 'success',
      title: 'Opsi Berhasil Disimpan!',
      text: 'Narasi opsi pilihan jadwal telah diperbarui dan langsung aktif.',
      timer: 1800,
      showConfirmButton: false,
    });
  } catch (err) {
    console.error('Error save jadwal types:', err);
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan',
      text: err.message || 'Terjadi gangguan saat menyimpan opsi pilihan jadwal.',
      confirmButtonColor: '#0d2346',
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan Opsi`;
    }
  }
}

// Simpan (Tambah / Update) Jadwal Ujian
async function handleSaveJadwal(e) {
  if (e && e.preventDefault) e.preventDefault();

  const editId = document.getElementById('jadwalEditId')?.value;
  const mahasiswaId = document.getElementById('jadwalMhsSelect')?.value;
  const jenis = document.getElementById('jadwalJenisSelect')?.value;
  const status = document.getElementById('jadwalStatusSelect')?.value;
  const tanggal = document.getElementById('jadwalTanggalInput')?.value;
  const jam = document.getElementById('jadwalJamInput')?.value;
  const ruangan = document.getElementById('jadwalRuanganInput')?.value;
  const catatan = document.getElementById('jadwalCatatanInput')?.value;

  const btn = document.getElementById('btnSubmitJadwal');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  try {
    let url = '/api/admin/jadwal';
    let method = 'POST';

    if (editId) {
      url = `/api/admin/jadwal/${editId}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        mahasiswaId,
        jenis,
        status,
        tanggal,
        jam,
        ruangan,
        catatan,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: data.message || 'Terjadi kesalahan.',
        confirmButtonColor: '#0d2346',
      });
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Simpan Jadwal Ujian</span>`;
      }
      return;
    }

    Swal.fire({
      icon: 'success',
      title: 'Berhasil!',
      text: data.message || 'Jadwal ujian berhasil disimpan dan disinkronkan real-time.',
      timer: 2000,
      showConfirmButton: false,
    });

    closeJadwalModal();
    loadJadwalAdmin(false);

  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat terhubung ke server.',
      confirmButtonColor: '#0d2346',
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Simpan Jadwal Ujian</span>`;
    }
  }
}

// Hapus Jadwal Ujian
async function handleDeleteJadwal(id, namaMhs) {
  const result = await Swal.fire({
    title: 'Hapus Jadwal Ujian?',
    text: `Jadwal ujian untuk mahasiswa "${namaMhs}" akan dihapus dari sistem.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal',
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/admin/jadwal/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menghapus',
        text: data.message || 'Gagal menghapus jadwal.',
        confirmButtonColor: '#0d2346',
      });
      return;
    }

    Swal.fire({
      icon: 'success',
      title: 'Terhapus!',
      text: data.message || 'Jadwal ujian berhasil dihapus.',
      timer: 1800,
      showConfirmButton: false,
    });

    loadJadwalAdmin(false);
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat terhubung ke server.',
      confirmButtonColor: '#0d2346',
    });
  }
}

// ══════════════════════════════════════════════════════════════
// MANAJEMEN SITECONFIG (EDIT NARASI/KONTEN WEB)
// ══════════════════════════════════════════════════════════════

// Load SiteConfig ke Form Admin (Delegated to High-Speed Bootstrap)
async function loadSiteConfigAdmin() {
  return fetchAdminBootstrap(false);
}

// Simpan Semua Narasi SiteConfig & Profil Dosen
async function handleSaveSiteConfig(e) {
  if (e && e.preventDefault) e.preventDefault();

  const btn = document.getElementById('btnSaveConfig');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Narasi...`;
  }

  const dosenNama = document.getElementById('cfg_dosen_nama')?.value.trim();
  const dosenJabatan = document.getElementById('cfg_dosen_jabatan')?.value.trim();

  // Simpan profil dosen jika diubah
  if (dosenNama || dosenJabatan) {
    if (dosenNama) currentDosenProfile.nama = dosenNama;
    if (dosenJabatan) currentDosenProfile.jabatan = dosenJabatan;
    renderDosenProfileNavbar(currentDosenProfile);

    fetch('/api/admin/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        nama: currentDosenProfile.nama,
        jabatan: currentDosenProfile.jabatan,
        foto: currentDosenProfile.foto,
      }),
    }).catch((err) => console.error('Error save profile via form:', err));
  }

  const configs = {
    beranda_header_chip: document.getElementById('cfg_beranda_header_chip')?.value.trim() || '',
    beranda_title: document.getElementById('cfg_beranda_title')?.value.trim() || '',
    beranda_subtitle: document.getElementById('cfg_beranda_subtitle')?.value.trim() || '',
    beranda_footer: document.getElementById('cfg_beranda_footer')?.value.trim() || '',
    login_judul: document.getElementById('cfg_login_judul')?.value.trim() || '',
    login_deskripsi: document.getElementById('cfg_login_deskripsi')?.value.trim() || '',
    login_petunjuk_admin: document.getElementById('cfg_login_petunjuk_admin')?.value.trim() || '',
    login_petunjuk_mhs: document.getElementById('cfg_login_petunjuk_mhs')?.value.trim() || '',
    helpdesk_info: document.getElementById('cfg_helpdesk_info')?.value.trim() || '',
  };

  try {
    const res = await fetch('/api/admin/siteconfig/bulk', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ configs }),
    });

    const data = await res.json();
    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: data.message || 'Terjadi kesalahan.',
        confirmButtonColor: '#0d2346',
      });
      return;
    }

    Swal.fire({
      icon: 'success',
      title: 'Pengaturan Berhasil Disimpan!',
      text: 'Semua teks, profil dosen, dan narasi web telah diperbarui secara real-time!',
      timer: 2000,
      showConfirmButton: false,
    });

  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Tidak dapat terhubung ke server.',
      confirmButtonColor: '#0d2346',
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan Semua Pengaturan Narasi</span>`;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MANAJEMEN PROFIL DOSEN (NAMA, JABATAN & FOTO PROFIL HD)
// ══════════════════════════════════════════════════════════════
function getDosenInitials(nama) {
  if (!nama) return 'DF';
  // Bersihkan gelar akademik umum agar inisial fokus ke nama
  const clean = nama.replace(/^(Dr\.|Prof\.|Ir\.|Drs\.|Dra\.)\s*/gi, '').trim();
  const words = clean.split(/\s+/).filter((w) => w && !w.includes('.') && w.match(/[A-Za-z]/));
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return 'DF';
}

async function loadDosenProfile() {
  return fetchAdminBootstrap(false);
}

function renderDosenProfileNavbar(prof) {
  if (!prof) return;
  const nameEl = document.getElementById('navAdminName');
  const roleEl = document.getElementById('navAdminRole');
  const avatarEl = document.getElementById('navAdminAvatar');
  const cfgNama = document.getElementById('cfg_dosen_nama');
  const cfgJabatan = document.getElementById('cfg_dosen_jabatan');
  const cfgThumb = document.getElementById('cfgDosenAvatarThumb');

  if (nameEl && prof.nama) nameEl.textContent = prof.nama;
  if (roleEl && prof.jabatan) roleEl.textContent = prof.jabatan;
  if (cfgNama && prof.nama) cfgNama.value = prof.nama;
  if (cfgJabatan && prof.jabatan) cfgJabatan.value = prof.jabatan;

  if (avatarEl) {
    if (prof.foto) {
      avatarEl.innerHTML = `<img src="${prof.foto}" alt="${escapeHtml(prof.nama)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      avatarEl.textContent = getDosenInitials(prof.nama);
    }
  }

  if (cfgThumb) {
    if (prof.foto) {
      cfgThumb.innerHTML = `<img src="${prof.foto}" alt="${escapeHtml(prof.nama)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      cfgThumb.textContent = getDosenInitials(prof.nama);
    }
  }
}

// Pasang listener sentuhan di HP agar profil terbuka seketika saat disentuh
document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('btnOpenDosenProfile');
  if (badge) {
    badge.addEventListener('touchend', (e) => {
      openDosenProfileModal();
    });
  }
});

function openDosenProfileModal() {
  const modal = document.getElementById('dosenProfileModal');
  if (!modal) {
    console.error('Modal dosenProfileModal tidak ditemukan di DOM!');
    return;
  }

  const nameInput = document.getElementById('inputDosenNama');
  const jabatanInput = document.getElementById('inputDosenJabatan');
  if (nameInput) nameInput.value = currentDosenProfile.nama || '';
  if (jabatanInput) jabatanInput.value = currentDosenProfile.jabatan || '';

  pendingDosenPhotoBase64 = null;
  const previewEl = document.getElementById('modalDosenAvatarPreview');
  if (previewEl) {
    if (currentDosenProfile.foto) {
      previewEl.innerHTML = `<img src="${currentDosenProfile.foto}" alt="Foto Profil" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      previewEl.textContent = getDosenInitials(currentDosenProfile.nama);
    }
  }

  // Tampilkan modal secara instan 0ms
  modal.style.display = 'flex';
  if (nameInput) {
    setTimeout(() => nameInput.focus(), 50);
  }
}

function closeDosenProfileModal() {
  const modal = document.getElementById('dosenProfileModal');
  if (modal) modal.style.display = 'none';
  pendingDosenPhotoBase64 = null;
  const fileInput = document.getElementById('inputDosenFoto');
  if (fileInput) fileInput.value = '';
}

function handleRemoveDosenPhoto() {
  pendingDosenPhotoBase64 = ''; // Tanda string kosong = hapus foto
  const previewEl = document.getElementById('modalDosenAvatarPreview');
  const nameInput = document.getElementById('inputDosenNama');
  const nama = (nameInput && nameInput.value.trim()) || currentDosenProfile.nama;
  if (previewEl) {
    previewEl.innerHTML = '';
    previewEl.textContent = getDosenInitials(nama);
  }
  const fileInput = document.getElementById('inputDosenFoto');
  if (fileInput) fileInput.value = '';
}

function handleDosenPhotoSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire({
      icon: 'warning',
      title: 'Format Tidak Sesuai',
      text: 'Harap pilih file gambar (JPG/PNG/WEBP).',
      confirmButtonColor: '#0d2346',
    });
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Crop & resize square 400x400 HD
      const canvas = document.createElement('canvas');
      const size = 400;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
      const base64 = canvas.toDataURL('image/jpeg', 0.88);
      pendingDosenPhotoBase64 = base64;

      const previewEl = document.getElementById('modalDosenAvatarPreview');
      if (previewEl) {
        previewEl.innerHTML = `<img src="${base64}" alt="Foto Profil" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function handleSaveDosenProfile(e) {
  if (e && e.preventDefault) e.preventDefault();

  const nama = document.getElementById('inputDosenNama').value.trim();
  const jabatan = document.getElementById('inputDosenJabatan').value.trim();

  if (!nama || !jabatan) {
    Swal.fire({
      icon: 'warning',
      title: 'Field Kosong',
      text: 'Nama lengkap dan jabatan tidak boleh kosong.',
      confirmButtonColor: '#0d2346',
    });
    return;
  }

  // Tentukan foto yang akan disimpan SEBELUM modal ditutup
  let fotoToSave = currentDosenProfile.foto || null;
  if (pendingDosenPhotoBase64 === '') {
    fotoToSave = null; // Pengguna menghapus foto
  } else if (pendingDosenPhotoBase64 !== null) {
    fotoToSave = pendingDosenPhotoBase64; // Pengguna memilih foto baru
  }

  const prevProfile = { ...currentDosenProfile };

  // Optimistic Instant Update di Navbar & State
  currentDosenProfile.nama = nama;
  currentDosenProfile.jabatan = jabatan;
  currentDosenProfile.foto = fotoToSave;
  renderDosenProfileNavbar(currentDosenProfile);

  // Tutup modal seketika
  closeDosenProfileModal();

  // Mini toast konfirmasi non-blocking (1.5s)
  Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 1500,
    timerProgressBar: true,
  }).fire({
    icon: 'success',
    title: 'Profil dosen berhasil diperbarui',
  });

  // Kirim simpanan ke server di background
  try {
    const res = await fetch('/api/admin/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        nama,
        jabatan,
        foto: fotoToSave,
      }),
    });

    const data = await res.json();
    if (data.success && data.profile) {
      currentDosenProfile = data.profile;
      renderDosenProfileNavbar(currentDosenProfile);
    } else if (!data.success) {
      // Rollback jika gagal
      currentDosenProfile = prevProfile;
      renderDosenProfileNavbar(currentDosenProfile);
      Swal.fire({
        icon: 'error',
        title: 'Gagal',
        text: data.message || 'Gagal menyimpan profil dosen.',
        confirmButtonColor: '#0d2346',
      });
    }
  } catch (err) {
    console.error('Error save profile dosen:', err);
    currentDosenProfile = prevProfile;
    renderDosenProfileNavbar(currentDosenProfile);
    Swal.fire({
      icon: 'error',
      title: 'Kesalahan Sistem',
      text: 'Terjadi gangguan jaringan saat menyimpan profil.',
      confirmButtonColor: '#0d2346',
    });
  }
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP-STYLE STUDENT PHOTO LIGHTBOX MODAL
// ══════════════════════════════════════════════════════════════
function getStudentInitials(nama) {
  if (!nama) return 'M';
  const clean = nama.replace(/^(Sdr\.|Sdri\.|Mhs\.)\s*/gi, '').trim();
  const words = clean.split(/\s+/).filter((w) => w && !w.includes('.') && w.match(/[A-Za-z]/));
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return 'M';
}

function openStudentPhotoLightbox(studentId) {
  const m = allStudents.find((s) => s.id === studentId);
  if (!m) return;

  const modal = document.getElementById('studentPhotoModal');
  const nameEl = document.getElementById('waModalStudentName');
  const metaEl = document.getElementById('waModalStudentMeta');
  const container = document.getElementById('waModalPhotoContainer');
  const statusEl = document.getElementById('waModalPhotoStatus');
  const btnBerkas = document.getElementById('waBtnPeriksaBerkas');
  const btnEdit = document.getElementById('waBtnEditMhs');

  if (!modal || !nameEl || !metaEl || !container) return;

  nameEl.textContent = m.nama;
  metaEl.textContent = `NIM: ${m.nim} • Angkatan ${m.angkatan || '-'} • ${m.prodi || 'Psikologi'}`;

  if (m.fotoProfil) {
    container.innerHTML = `
      <img src="${m.fotoProfil}" alt="${escapeHtml(m.nama)}" style="width: 100%; height: 100%; object-fit: contain; display: block; animation: waPopupFadeIn 0.22s ease;">
    `;
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #4ade80;"><i class="fa-solid fa-circle-check"></i> Foto Profil Mahasiswa</span>`;
    }
  } else {
    const initials = getStudentInitials(m.nama);
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2.5rem 1.5rem; gap: 1rem; animation: waPopupFadeIn 0.22s ease;">
        <div style="width: 110px; height: 110px; border-radius: 50%; background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; display: flex; align-items: center; justify-content: center; font-size: 2.8rem; font-weight: 800; border: 3px solid #60a5fa; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
          ${initials}
        </div>
        <div style="color: #94a3b8; font-size: 0.85rem; max-width: 270px; line-height: 1.4;">
          Mahasiswa ini belum mengunggah foto profil di akun portal mahasiswa.
        </div>
      </div>
    `;
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #facc15;"><i class="fa-solid fa-circle-info"></i> Belum Ada Foto</span>`;
    }
  }

  if (btnBerkas) {
    btnBerkas.onclick = () => {
      closeStudentPhotoLightbox();
      openVerificationModal(m.id);
    };
  }
  if (btnEdit) {
    btnEdit.onclick = () => {
      closeStudentPhotoLightbox();
      openEditStudentModal(m.id);
    };
  }

  modal.style.display = 'flex';
}

function closeStudentPhotoLightbox() {
  const modal = document.getElementById('studentPhotoModal');
  if (modal) modal.style.display = 'none';
}

// Tutup modal WA jika pengguna menekan tombol Escape (ESC)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeStudentPhotoLightbox();
  }
});

// ══════════════════════════════════════════════════════════════
// LIVE POV (POINT OF VIEW) CONTROLLER
// ══════════════════════════════════════════════════════════════
function switchPovMode(mode) {
  const btnBeranda = document.getElementById('btnPovBeranda');
  const btnMahasiswa = document.getElementById('btnPovMahasiswa');
  const btnLogin = document.getElementById('btnPovLogin');

  const screenBeranda = document.getElementById('povScreenBeranda');
  const screenMahasiswa = document.getElementById('povScreenMahasiswa');
  const screenLogin = document.getElementById('povScreenLogin');
  const urlEl = document.getElementById('povBrowserUrl');

  if (btnBeranda) btnBeranda.classList.remove('active');
  if (btnMahasiswa) btnMahasiswa.classList.remove('active');
  if (btnLogin) btnLogin.classList.remove('active');

  if (screenBeranda) screenBeranda.style.display = 'none';
  if (screenMahasiswa) screenMahasiswa.style.display = 'none';
  if (screenLogin) screenLogin.style.display = 'none';

  if (mode === 'beranda') {
    if (btnBeranda) btnBeranda.classList.add('active');
    if (screenBeranda) screenBeranda.style.display = 'block';
    if (urlEl) urlEl.innerHTML = `<i class="fa-solid fa-lock"></i> https://siakad-skripsi-web.vercel.app/`;
  } else if (mode === 'mahasiswa') {
    if (btnMahasiswa) btnMahasiswa.classList.add('active');
    if (screenMahasiswa) screenMahasiswa.style.display = 'block';
    if (urlEl) urlEl.innerHTML = `<i class="fa-solid fa-lock"></i> https://siakad-skripsi-web.vercel.app/mahasiswa.html`;
  } else if (mode === 'login') {
    if (btnLogin) btnLogin.classList.add('active');
    if (screenLogin) screenLogin.style.display = 'block';
    if (urlEl) urlEl.innerHTML = `<i class="fa-solid fa-lock"></i> https://siakad-skripsi-web.vercel.app/login.html`;
  }
}

function syncPovLive() {
  const getVal = (id, fallback) => {
    const el = document.getElementById(id);
    return el && el.value.trim() ? el.value : fallback;
  };

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // 1. Beranda
  setTxt('povBerandaChip', getVal('cfg_beranda_header_chip', 'Tahun Akademik 2024/2025 Genap'));
  setTxt('povBerandaTitle', getVal('cfg_beranda_title', 'Portal Monitoring Skripsi & Akademik Bimbingan'));
  setTxt('povBerandaSubtitle', getVal('cfg_beranda_subtitle', 'Sistem pemantauan berkas seminar proposal, seminar hasil, dan ujian skripsi secara transparan, terintegrasi, dan real-time.'));
  setTxt('povBerandaFooter', getVal('cfg_beranda_footer', 'Sistem Informasi Manajemen Skripsi & Verifikasi Berkas Terpadu • Program Studi Psikologi'));

  // 2. Login
  setTxt('povLoginJudul', getVal('cfg_login_judul', 'Masuk ke Portal'));
  setTxt('povLoginDeskripsi', getVal('cfg_login_deskripsi', 'Portal Monitoring Skripsi & Verifikasi Berkas'));
  setTxt('povLoginPetunjukMhs', getVal('cfg_login_petunjuk_mhs', 'Masukkan nama lengkap NIM Anda'));
  setTxt('povLoginHelpdesk', getVal('cfg_helpdesk_info', 'Butuh aktivasi NIM? Hubungi Helpdesk Akademik Gedung Rektorat Lt. 1.'));
}


