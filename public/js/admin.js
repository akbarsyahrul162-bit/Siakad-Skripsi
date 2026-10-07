let socket = null;
let allStudents = [];
let filteredStudents = [];
let globalPortalsConfig = {};
let currentViewingStudent = null;
let currentViewingPortals = [];
let activePortalKey = 'PORTAL_1';
let activeReqPortalKey = 'PORTAL_1';
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
      loadStudents(false);

      if (currentViewingStudent && currentViewingStudent.id === data.mahasiswaId) {
        openVerificationModal(data.mahasiswaId, false);
      }
    });

    // Real-Time Listener: Saat mahasiswa baru ditambahkan / diedit / dihapus
    socket.on('whitelist_updated', () => {
      loadStudents(false);
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
        <td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-muted);">
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
    if (data.portalsConfig) {
      globalPortalsConfig = data.portalsConfig;
    }

    // Render dynamic table headers
    renderTableHeaders();

    // Update Quick Stats
    updateStats(data);

    // Apply Filter & Search
    handleSearchFilter();
  } catch (err) {
    console.error(err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2rem; color: #dc2626;">
            Gagal memuat data mahasiswa. Silakan muat ulang halaman.
          </td>
        </tr>
      `;
    }
  }
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

      portalCellsHtml += `
        <td>
          <span class="badge-status ${meta.cls}" style="font-size: 0.68rem; padding: 0.25rem 0.6rem; display: inline-flex; align-items: center; gap: 0.25rem;">
            <i class="${meta.icon}"></i> ${meta.label}
          </span>
        </td>
      `;
    });

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
    <div class="doc-req-item" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem; display: flex; gap: 0.75rem; align-items: center;">
      <div style="font-weight: 700; color: #64748b; font-size: 0.9rem; min-width: 24px;">#${idx + 1}</div>
      <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
        <input type="text" class="input-portal-single req-doc-name" value="${escapeHtml(b.nama)}" placeholder="Nama Syarat Berkas" style="font-size: 0.82rem; padding: 0.5rem 0.75rem;">
        <input type="text" class="input-portal-single req-doc-desc" value="${escapeHtml(b.keterangan)}" placeholder="Keterangan / Ketentuan" style="font-size: 0.82rem; padding: 0.5rem 0.75rem;">
      </div>
      <button type="button" onclick="removeDocRequirementRow(this)" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.45rem 0.65rem; cursor: pointer;" title="Hapus Dokumen">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `
    )
    .join('');
}

function addDocRequirementRow() {
  const container = document.getElementById('reqDocsContainer');
  const count = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'doc-req-item';
  div.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem; display: flex; gap: 0.75rem; align-items: center;';
  div.innerHTML = `
    <div style="font-weight: 700; color: #64748b; font-size: 0.9rem; min-width: 24px;">#${count}</div>
    <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
      <input type="text" class="input-portal-single req-doc-name" placeholder="Nama Dokumen Baru" style="font-size: 0.82rem; padding: 0.5rem 0.75rem;">
      <input type="text" class="input-portal-single req-doc-desc" placeholder="Keterangan / Ketentuan" style="font-size: 0.82rem; padding: 0.5rem 0.75rem;">
    </div>
    <button type="button" onclick="removeDocRequirementRow(this)" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.45rem 0.65rem; cursor: pointer;" title="Hapus Dokumen">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  container.appendChild(div);
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
    if (docName) {
      berkas.push({
        nomor: idx + 1,
        nama: docName,
        keterangan: docDesc,
        formatContoh: `0${idx + 1}_${docName.replace(/[^a-zA-Z0-9]/g, '_')}_[NIM].pdf`
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

    Swal.fire({
      icon: 'success',
      title: 'Verifikasi Terkirim!',
      text: 'Keputusan verifikasi telah tersimpan dan terkirim ke mahasiswa secara real-time.',
      timer: 2000,
      showConfirmButton: false
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

