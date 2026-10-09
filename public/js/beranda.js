// ══════════════════════════════════════════════════════════════
// BERANDA PUBLIK - DIRECTORY & EXAM SCHEDULE CONTROLLER
// ══════════════════════════════════════════════════════════════

let allStudents = [];
let allJadwal = [];
let globalJadwalTypesMap = {};

document.addEventListener('DOMContentLoaded', () => {
  const hasCache = restoreBerandaCache();
  if (!hasCache) {
    renderBerandaSkeletons();
  }
  fetchBerandaBootstrap();
  initRealtimeSync();
});

// A. Restore data instan 0.005 detik dari Local Cache Browser
function restoreBerandaCache() {
  try {
    const raw = localStorage.getItem('beranda_bootstrap_cache');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.success) return false;

    if (data.config) applySiteConfig(data.config);
    if (data.types && Array.isArray(data.types)) {
      globalJadwalTypesMap = {};
      data.types.forEach((t) => { globalJadwalTypesMap[t.id] = t; });
    }
    if (data.stats) renderStats(data.stats);
    if (Array.isArray(data.mahasiswa)) {
      allStudents = data.mahasiswa;
      populateAngkatanDatalist('listAngkatanBeranda');
      renderStudentTable(allStudents);
    }
    if (Array.isArray(data.jadwal)) {
      allJadwal = data.jadwal;
      renderJadwalList(allJadwal);
    }
    return true;
  } catch (e) {
    console.warn('Gagal membaca cache beranda:', e);
    return false;
  }
}

// B. Render Skeleton Shimmer Placeholder saat pengunjung baru (belum ada cache)
function renderBerandaSkeletons() {
  const tbody = document.getElementById('publicStudentTableBody');
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
                <span class="skeleton-shimmer skeleton-text" style="width: 140px; display: block;"></span>
                <span class="skeleton-shimmer skeleton-text" style="width: 80px; display: block;"></span>
              </div>
            </div>
          </td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 90px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 200px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 110px; display: block;"></span></td>
          <td><span class="skeleton-shimmer skeleton-text" style="width: 100px; display: block;"></span></td>
        </tr>
      `;
    }
    tbody.innerHTML = rowsHtml;
  }
}

// C. Terapkan Konfigurasi Teks/Branding Dinamis
function applySiteConfig(cfg) {
  if (!cfg) return;
  if (cfg.beranda_header_chip) {
    const el = document.getElementById('txtHeaderChip');
    if (el) el.textContent = cfg.beranda_header_chip;
  }
  if (cfg.beranda_title) {
    const el = document.getElementById('txtMainTitle');
    if (el) el.textContent = cfg.beranda_title;
    document.title = cfg.beranda_title + ' - SIAKAD';
  }
  if (cfg.beranda_subtitle) {
    const el = document.getElementById('txtSubtitle');
    if (el) el.textContent = cfg.beranda_subtitle;
  }
  if (cfg.beranda_footer) {
    const el = document.getElementById('footerText');
    if (el) el.textContent = cfg.beranda_footer;
  }
}

// D. High-Speed Bootstrap Fetcher (1 Round-Trip HTTP Request)
async function fetchBerandaBootstrap() {
  try {
    const res = await fetch('/api/publik/bootstrap');
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('beranda_bootstrap_cache', JSON.stringify(data));
      if (data.config) applySiteConfig(data.config);
      if (data.types && Array.isArray(data.types)) {
        globalJadwalTypesMap = {};
        data.types.forEach((t) => { globalJadwalTypesMap[t.id] = t; });
      }
      if (data.stats) renderStats(data.stats);
      if (Array.isArray(data.mahasiswa)) {
        allStudents = data.mahasiswa;
        populateAngkatanDatalist('listAngkatanBeranda');
        filterStudents();
      }
      if (Array.isArray(data.jadwal)) {
        allJadwal = data.jadwal;
        renderJadwalList(allJadwal);
      }
    }
  } catch (err) {
    console.error('Gagal fetch bootstrap publik:', err);
  }
}

// Backward-compatible fallback helpers
async function loadSiteConfig() { return fetchBerandaBootstrap(); }
async function loadMahasiswaData() { return fetchBerandaBootstrap(); }

// 3. Render Statistik Ringkasan (Dinamis Sesuai Card Tahapan yang Dibuat Dosen)
function renderStats(stats) {
  const container = document.getElementById('publicStatsContainer');
  if (container && Array.isArray(stats.stageCards) && stats.stageCards.length > 0) {
    let html = `
      <div class="stat-card">
        <div class="stat-card-info">
          <div class="stat-num" id="statTotalStudents">${stats.totalMahasiswa || 0}</div>
          <div class="stat-lbl">Total Mahasiswa Bimbingan</div>
        </div>
        <div class="stat-icon stat-icon-blue">
          <i class="fa-solid fa-user-graduate"></i>
        </div>
      </div>
    `;

    stats.stageCards.forEach((c) => {
      html += `
        <div class="stat-card">
          <div class="stat-card-info">
            <div class="stat-num" style="color: ${c.color};">${c.count || 0}</div>
            <div class="stat-lbl">${escapeHtml(c.label)}</div>
          </div>
          <div class="stat-icon" style="background: ${c.bg}; color: ${c.color};">
            <i class="${c.icon}"></i>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    return;
  }

  const elTotal = document.getElementById('statTotalStudents');
  const elSempro = document.getElementById('statSempro');
  const elSemhas = document.getElementById('statSemhas');
  const elSkripsi = document.getElementById('statSkripsi');

  if (elTotal) elTotal.textContent = stats.totalMahasiswa || 0;
  if (elSempro) elSempro.textContent = stats.lulusSempro || 0;
  if (elSemhas) elSemhas.textContent = stats.lulusSemhas || 0;
  if (elSkripsi) elSkripsi.textContent = stats.lulusSkripsi || 0;
}

// 4. Render Tabel Mahasiswa
function renderStudentTable(students) {
  const tbody = document.getElementById('publicStudentTableBody');
  const countLabel = document.getElementById('studentsCountLabel');
  if (!tbody) return;

  if (countLabel) {
    countLabel.textContent = `Menampilkan ${students.length} mahasiswa`;
  }

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-inbox fa-2x" style="margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
          Tidak ada data mahasiswa yang cocok dengan kriteria pencarian.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = students.map((m, idx) => {
    // Avatar / Foto
    const initial = (m.nama || 'M').charAt(0).toUpperCase();
    const avatarHtml = m.fotoProfil 
      ? `<img src="${m.fotoProfil}" alt="${m.nama}" class="student-avatar" />`
      : `<div class="student-avatar">${initial}</div>`;

    // Status Badge Styling
    let badgeClass = 'badge-EMPTY';
    if (m.statusRingkas === 'Lulus Skripsi') badgeClass = 'badge-APPROVED';
    else if (m.statusRingkas === 'Lulus Semhas') badgeClass = 'badge-APPROVED';
    else if (m.statusRingkas === 'Lulus Sempro') badgeClass = 'badge-APPROVED';
    else if (m.statusRingkas === 'Dalam Revisi') badgeClass = 'badge-REVISION';
    else if (m.statusRingkas === 'Menunggu Verifikasi') badgeClass = 'badge-PENDING';

    // Jadwal Ujian Badge / Info
    let jadwalHtml = '<span style="color: #94a3b8; font-size: 0.8rem;">Belum dijadwalkan</span>';
    if (m.jadwalTerdekat) {
      const j = m.jadwalTerdekat;
      const tgl = new Date(j.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const typeObj = globalJadwalTypesMap[j.jenis];
      const typeName = typeObj ? typeObj.nama : j.jenis;
      const badgeStyle = typeObj && typeObj.badgeColor
        ? `background: ${typeObj.badgeBg || '#e0f2fe'}; color: ${typeObj.badgeColor || '#0369a1'}; border: 1px solid rgba(0,0,0,0.08);`
        : '';
      const iconHtml = j.jenis === 'WISUDA' ? '<i class="fa-solid fa-graduation-cap" style="margin-right: 2px;"></i>' : '';
      jadwalHtml = `
        <div style="font-size: 0.78rem;">
          <span class="badge-exam badge-exam-${j.jenis}" style="${badgeStyle}">${iconHtml}${escapeHtml(typeName)}</span>
          <div style="font-weight: 600; color: var(--primary-navy); margin-top: 0.2rem;">
            <i class="fa-regular fa-calendar" style="font-size: 0.7rem;"></i> ${tgl} • ${escapeHtml(j.jam)}
          </div>
          <div style="color: var(--text-muted); font-size: 0.72rem;">
            <i class="fa-solid fa-door-open" style="font-size: 0.7rem;"></i> ${escapeHtml(j.ruangan)}
          </div>
        </div>
      `;
    }

    return `
      <tr>
        <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${avatarHtml}
            <div>
              <div style="font-weight: 700; color: var(--primary-navy); font-size: 0.92rem;">${escapeHtml(m.nama)}</div>
              <div style="font-size: 0.78rem; color: #64748b; font-family: monospace;">NIM: ${escapeHtml(m.nim)}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--primary-navy);">${escapeHtml(m.prodi || 'Psikologi')}</div>
          <div style="font-size: 0.75rem; color: #64748b;">Angkatan ${escapeHtml(m.angkatan)}</div>
        </td>
        <td>
          <div style="font-size: 0.84rem; color: var(--text-main); font-weight: 500; line-height: 1.4; max-width: 320px;">
            ${m.judulSkripsi ? escapeHtml(m.judulSkripsi) : '<em style="color:#94a3b8;">Belum ada judul yang dicatat</em>'}
          </div>
        </td>
        <td>
          <span class="badge-status ${badgeClass}" style="display: inline-block;">
            ${m.statusRingkas}
          </span>
          <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.25rem;">
            ${m.approvedCount} / ${m.totalPortal} Tahap ACC
          </div>
        </td>
        <td>
          ${jadwalHtml}
        </td>
      </tr>
    `;
  }).join('');
}

// 5. Muat Data Jadwal Ujian Terdekat
async function loadJadwalData() {
  try {
    const res = await fetch('/api/publik/jadwal');
    const data = await res.json();
    if (data.success) {
      if (data.types && Array.isArray(data.types)) {
        globalJadwalTypesMap = {};
        data.types.forEach((t) => {
          globalJadwalTypesMap[t.id] = t;
        });
      }
      allJadwal = data.jadwal || [];
      renderJadwalList(allJadwal);
    }
  } catch (err) {
    console.error('Gagal memuat jadwal ujian:', err);
  }
}

// 6. Render Card Jadwal Ujian
function renderJadwalList(jadwalList) {
  const container = document.getElementById('jadwalListContainer');
  const countLabel = document.getElementById('jadwalCountLabel');
  if (!container) return;

  if (countLabel) {
    countLabel.textContent = `${jadwalList.length} Terjadwal`;
  }

  if (jadwalList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; background: white; border-radius: 12px; border: 1px dashed var(--border-color); color: var(--text-muted);">
        <i class="fa-regular fa-calendar-xmark fa-2x" style="margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
        Belum ada agenda jadwal ujian terdekat yang ditetapkan dosen.
      </div>
    `;
    return;
  }

  container.innerHTML = jadwalList.map((j) => {
    const tgl = new Date(j.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const initial = (j.mahasiswa?.nama || 'M').charAt(0).toUpperCase();
    const typeObj = globalJadwalTypesMap[j.jenis];
    const typeName = typeObj ? typeObj.nama : j.jenis;
    const badgeStyle = typeObj && typeObj.badgeColor
      ? `background: ${typeObj.badgeBg || '#e0f2fe'}; color: ${typeObj.badgeColor || '#0369a1'}; border: 1px solid rgba(0,0,0,0.08);`
      : '';
    const iconHtml = j.jenis === 'WISUDA' ? '<i class="fa-solid fa-graduation-cap" style="margin-right: 2px;"></i>' : '';

    return `
      <div class="jadwal-card">
        <div style="display: flex; gap: 0.85rem; align-items: flex-start;">
          <div class="student-avatar" style="width: 44px; height: 44px; font-size: 1.05rem;">
            ${initial}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;">
              <span class="badge-exam badge-exam-${j.jenis}" style="${badgeStyle}">
                ${iconHtml}${escapeHtml(typeName)}
              </span>
              <span style="font-size: 0.72rem; color: #10b981; font-weight: 700; background: #ecfdf5; padding: 0.15rem 0.45rem; border-radius: 4px;">
                ${escapeHtml(j.status)}
              </span>
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--primary-navy); margin-bottom: 0.15rem;">
              ${escapeHtml(j.mahasiswa?.nama || '-')}
            </h4>
            <div style="font-size: 0.75rem; color: #64748b; font-family: monospace;">
              NIM: ${escapeHtml(j.mahasiswa?.nim || '-')} • Angkatan ${escapeHtml(j.mahasiswa?.angkatan || '-')}
            </div>
            <div style="margin-top: 0.6rem; font-size: 0.78rem; color: var(--text-main); display: flex; flex-direction: column; gap: 0.2rem;">
              <div><i class="fa-regular fa-calendar" style="color: var(--primary-blue); width: 14px;"></i> <strong>${tgl}</strong></div>
              <div><i class="fa-regular fa-clock" style="color: var(--primary-blue); width: 14px;"></i> Pukul: <strong>${escapeHtml(j.jam)} WITA</strong></div>
              <div><i class="fa-solid fa-location-dot" style="color: var(--primary-blue); width: 14px;"></i> Ruangan: <strong>${escapeHtml(j.ruangan)}</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
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

// 7. Filter & Search dengan Smart Detection Tahun Angkatan
function handleFilter() {
  const searchInput = document.getElementById('searchStudentInput');
  const filterAngkatan = document.getElementById('filterAngkatan');
  const filterStatus = document.getElementById('filterStatus');

  const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const rawAngkatan = filterAngkatan ? filterAngkatan.value.trim() : '';
  const detectedYear = extractYearFromText(rawAngkatan);
  const status = filterStatus ? filterStatus.value : '';

  const filtered = allStudents.filter((m) => {
    const matchQ = !q || (m.nama && m.nama.toLowerCase().includes(q)) ||
                   (m.nim && m.nim.toLowerCase().includes(q)) ||
                   (m.judulSkripsi && m.judulSkripsi.toLowerCase().includes(q));

    let matchAngkatan = true;
    if (detectedYear) {
      const mhsYear = extractYearFromText(m.angkatan) || String(m.angkatan || '');
      matchAngkatan = mhsYear === detectedYear || String(m.angkatan || '').includes(detectedYear);
    }

    const matchStatus = !status || m.statusRingkas === status;
    return matchQ && matchAngkatan && matchStatus;
  });

  renderStudentTable(filtered);
}

function filterStudents() {
  handleFilter();
}

// 8. Real-Time Synchronization via Socket.io
function initRealtimeSync() {
  if (typeof io === 'undefined') return;
  const socket = io();

  let refreshTimer = null;
  const debouncedRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      fetchBerandaBootstrap();
    }, 250);
  };

  // Dengarkan setiap event pembaruan
  socket.on('whitelist_updated', debouncedRefresh);
  socket.on('submission_updated', debouncedRefresh);
  socket.on('status_verified', debouncedRefresh);
  socket.on('mahasiswa_title_updated', debouncedRefresh);
  socket.on('jadwal_updated', debouncedRefresh);
  socket.on('jadwal_types_updated', debouncedRefresh);
  socket.on('siteconfig_updated', debouncedRefresh);
  socket.on('siteconfig_bulk_updated', debouncedRefresh);
  socket.on('portals_config_updated', debouncedRefresh);
}

// Helper escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
