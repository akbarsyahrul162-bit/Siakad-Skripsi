let socket = null;
let allStudents = [];
let filteredStudents = [];
let currentViewingStudent = null;
let currentViewingPortals = [];
let activePortalKey = 'PORTAL_1';
let selectedDecision = null;

const STATUS_META = {
  EMPTY: { label: 'Belum Diisi', cls: 'badge-EMPTY', icon: 'fa-regular fa-clock' },
  PENDING: { label: 'Periksa Berkas', cls: 'badge-PENDING', icon: 'fa-solid fa-hourglass-half' },
  APPROVED: { label: 'ACC / Valid', cls: 'badge-APPROVED', icon: 'fa-solid fa-circle-check' },
  REVISION: { label: 'Revisi', cls: 'badge-REVISION', icon: 'fa-solid fa-triangle-exclamation' },
};

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadStudents();
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
      // Perbarui tabel secara halus tanpa reload penuh
      loadStudents(false);

      // Jika dosen sedang membuka modal berkas mahasiswa tersebut, perbarui tampilan modal
      if (currentViewingStudent && currentViewingStudent.id === data.mahasiswaId) {
        openVerificationModal(data.mahasiswaId, false);
      }
    });

    // Real-Time Listener: Saat mahasiswa baru ditambahkan / dihapus
    socket.on('whitelist_updated', () => {
      loadStudents(false);
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

// Load students directory from server
async function loadStudents(showLoading = true) {
  const tbody = document.getElementById('studentTableBody');
  if (showLoading && tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-spinner fa-spin"></i> Memuat data mahasiswa...
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch('/api/admin/mahasiswa', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/index.html';
        return;
      }
      throw new Error('Gagal mengambil data');
    }

    const data = await res.json();
    allStudents = data.mahasiswa || [];

    // Update Stats
    updateStats(data);

    // Apply Filter & Search
    handleSearchFilter();
  } catch (err) {
    console.error(err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: #dc2626;">
            Gagal memuat data mahasiswa. Silakan muat ulang halaman.
          </td>
        </tr>
      `;
    }
  }
}

// Update Quick Stats
function updateStats(data) {
  const total = data.totalMahasiswa || allStudents.length;
  let pending = 0;
  let approved = 0;

  allStudents.forEach((m) => {
    Object.values(m.portals || {}).forEach((sub) => {
      if (sub.status === 'PENDING') pending++;
      if (sub.status === 'APPROVED') approved++;
    });
  });

  document.getElementById('statTotalStudents').textContent = total;
  document.getElementById('statPendingReviews').textContent = pending;
  document.getElementById('statApprovedReviews').textContent = approved;
}

// Filter and Search logic
function handleSearchFilter() {
  const query = (document.getElementById('searchStudentInput').value || '').toLowerCase().trim();
  const angkatan = document.getElementById('filterAngkatan').value;

  filteredStudents = allStudents.filter((m) => {
    const matchNameOrNim = m.nama.toLowerCase().includes(query) || m.nim.toLowerCase().includes(query);
    const matchAngkatan = angkatan ? String(m.angkatan) === String(angkatan) : true;
    return matchNameOrNim && matchAngkatan;
  });

  renderTable(filteredStudents);
}

// Render Table Rows
function renderTable(students) {
  const tbody = document.getElementById('studentTableBody');
  const countLabel = document.getElementById('studentsCountLabel');
  if (!tbody) return;

  countLabel.textContent = `Menampilkan ${students.length} dari ${allStudents.length} mahasiswa`;

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Tidak ditemukan mahasiswa yang sesuai dengan pencarian.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  students.forEach((m, idx) => {
    const p1 = m.portals.PORTAL_1 || { status: 'EMPTY' };
    const p2 = m.portals.PORTAL_2 || { status: 'EMPTY' };
    const p3 = m.portals.PORTAL_3 || { status: 'EMPTY' };

    const metaP1 = STATUS_META[p1.status] || STATUS_META.EMPTY;
    const metaP2 = STATUS_META[p2.status] || STATUS_META.EMPTY;
    const metaP3 = STATUS_META[p3.status] || STATUS_META.EMPTY;

    html += `
      <tr>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${idx + 1}</td>
        <td>
          <div class="student-col-info">
            <span class="s-name">${escapeHtml(m.nama)}</span>
            <span class="s-meta">NIM: <strong>${escapeHtml(m.nim)}</strong></span>
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
        <td>
          <span class="badge-status ${metaP1.cls}" style="font-size: 0.68rem; padding: 0.25rem 0.6rem;">
            <i class="${metaP1.icon}"></i> ${metaP1.label}
          </span>
        </td>
        <td>
          <span class="badge-status ${metaP2.cls}" style="font-size: 0.68rem; padding: 0.25rem 0.6rem;">
            <i class="${metaP2.icon}"></i> ${metaP2.label}
          </span>
        </td>
        <td>
          <span class="badge-status ${metaP3.cls}" style="font-size: 0.68rem; padding: 0.25rem 0.6rem;">
            <i class="${metaP3.icon}"></i> ${metaP3.label}
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 0.4rem;">
            <button class="btn-view-berkas" onclick="openVerificationModal(${m.id})" title="Periksa Berkas & Drive">
              <i class="fa-solid fa-folder-open"></i> Periksa
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
      alert(data.message || 'Gagal menambahkan mahasiswa.');
      btn.disabled = false;
      btn.innerHTML = `<span>Aktivasi Whitelist Mahasiswa</span>`;
      return;
    }

    alert(data.message);
    closeAddStudentModal();
    btn.disabled = false;
    btn.innerHTML = `<span>Aktivasi Whitelist Mahasiswa</span>`;
    loadStudents();
  } catch (err) {
    console.error(err);
    alert('Terjadi kesalahan koneksi.');
    btn.disabled = false;
    btn.innerHTML = `<span>Aktivasi Whitelist Mahasiswa</span>`;
  }
}

// Delete student from whitelist
async function handleDeleteStudent(id, name) {
  if (!confirm(`Apakah Anda yakin ingin menghapus mahasiswa ${name} dari daftar whitelist? Mahasiswa ini tidak akan bisa login lagi.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/mahasiswa/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (res.ok) {
      loadStudents();
    } else {
      alert(data.message || 'Gagal menghapus.');
    }
  } catch (err) {
    alert('Koneksi gagal.');
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
    currentViewingPortals = data.portals;

    // Header info
    document.getElementById('vModalStudentTitle').textContent = `Periksa Berkas: ${currentViewingStudent.nama}`;
    document.getElementById('vModalStudentMeta').textContent = `NIM: ${currentViewingStudent.nim} • Angkatan: ${currentViewingStudent.angkatan} • ${currentViewingStudent.prodi}`;

    if (switchTabToFirst) {
      activePortalKey = 'PORTAL_1';
    }

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

function switchVerificationPortal(portalKey) {
  activePortalKey = portalKey;

  // Active tab styling
  document.getElementById('vTabPortal1').className = `tab-btn ${portalKey === 'PORTAL_1' ? 'active' : ''}`;
  document.getElementById('vTabPortal2').className = `tab-btn ${portalKey === 'PORTAL_2' ? 'active' : ''}`;
  document.getElementById('vTabPortal3').className = `tab-btn ${portalKey === 'PORTAL_3' ? 'active' : ''}`;

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
  checklistEl.innerHTML = portal.berkas
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
    // Jika folder Google Drive: /folders/FOLDER_ID
    const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
    }

    // Jika file Google Drive: /file/d/FILE_ID/view atau /d/FILE_ID
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch && fileMatch[1]) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }

    // Fallback: jika format langsung ID
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
    alert('Silakan pilih salah satu keputusan: "Setujui (ACC)" atau "Minta Perbaikan (Revisi)".');
    return;
  }

  const catatanDosen = document.getElementById('vCatatanDosen').value.trim();
  if (selectedDecision === 'REVISION' && !catatanDosen) {
    alert('Harap masukkan catatan perbaikan untuk mahasiswa agar mereka tahu apa yang perlu diperbaiki.');
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
      alert(data.message || 'Gagal menyimpan verifikasi.');
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

    setTimeout(() => {
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Simpan & Kirim Verifikasi</span>`;
    }, 2000);
  } catch (err) {
    console.error(err);
    alert('Koneksi server gagal.');
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Simpan & Kirim Verifikasi</span>`;
  }
}

// Logout Dosen
async function handleAdminLogout() {
  if (!confirm('Apakah Anda ingin keluar dari Portal Dosen?')) return;
  try {
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
