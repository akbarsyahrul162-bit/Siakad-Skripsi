let currentStudent = null;
let currentPortals = [];
let socket = null;

// Status badges helper
const STATUS_META = {
  EMPTY: { label: 'Belum Mengumpulkan', cls: 'badge-EMPTY', icon: 'fa-regular fa-clock' },
  PENDING: { label: 'Menunggu Pemeriksaan', cls: 'badge-PENDING', icon: 'fa-solid fa-hourglass-half' },
  APPROVED: { label: 'Disetujui (ACC)', cls: 'badge-APPROVED', icon: 'fa-solid fa-circle-check' },
  REVISION: { label: 'Perlu Perbaikan (Revisi)', cls: 'badge-REVISION', icon: 'fa-solid fa-triangle-exclamation' },
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadPortalData();
});

// Setup Socket.io
function initSocket() {
  try {
    socket = io();

    socket.on('connect', () => {
      const el = document.getElementById('liveSyncStatus');
      if (el) {
        el.innerHTML = `<span class="live-dot"></span> Real-Time Sync Aktif`;
        el.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        el.style.color = '#34d399';
      }
    });

    socket.on('disconnect', () => {
      const el = document.getElementById('liveSyncStatus');
      if (el) {
        el.innerHTML = `<span class="live-dot" style="background:#ef4444; animation:none;"></span> Terputus`;
        el.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        el.style.color = '#f87171';
      }
    });

    // Real-time listener: ketika dosen memverifikasi status
    socket.on('status_verified', (data) => {
      if (currentStudent && data.mahasiswaId === currentStudent.id) {
        showRealtimeAlert(data);
        // Refresh data portal secara lokal tanpa reload halaman penuh
        loadPortalData(false);
      }
    });

    // Real-time listener: ketika dosen mengubah daftar syarat dokumen
    socket.on('portals_config_updated', () => {
      loadPortalData(false);
    });

    // Real-time listener: ketika jadwal ujian diperbarui
    socket.on('jadwal_updated', () => {
      loadPortalData(false);
    });

    // Real-time listener: ketika data profil atau whitelist diperbarui
    socket.on('whitelist_updated', (data) => {
      if (!data || !currentStudent) {
        loadPortalData(false);
      } else if (data.mahasiswa && data.mahasiswa.id === currentStudent.id) {
        loadPortalData(false);
      }
    });
  } catch (err) {
    console.error('Socket error:', err);
  }
}

// Show real-time notification on top
function showRealtimeAlert(data) {
  const notifBox = document.getElementById('realtimeNotification');
  if (!notifBox) return;

  const isApproved = data.status === 'APPROVED';
  notifBox.className = `alert-box alert-${isApproved ? 'success' : 'danger'}`;
  notifBox.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <strong><i class="fa-solid fa-bell"></i> Pemberitahuan Verifikasi Dosen:</strong>
        ${data.portal} Anda telah diperbarui menjadi 
        <strong>${isApproved ? 'DISETUJUI (ACC)' : 'PERLU PERBAIKAN (REVISI)'}</strong> oleh ${data.verifiedBy || 'Dosen Pembimbing'}.
        ${data.catatanDosen ? `<br><small style="margin-top: 4px; display:inline-block;"><em>Catatan: "${data.catatanDosen}"</em></small>` : ''}
      </div>
      <button onclick="this.parentElement.parentElement.style.display='none'" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem; color:inherit;">&times;</button>
    </div>
  `;
  notifBox.style.display = 'block';

  // Auto scroll up smoothly
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper otentikasi token
function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...extra };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Load data from server
async function loadPortalData(showLoading = true) {
  const container = document.getElementById('portalsContainer');
  if (showLoading && container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; background: white; border-radius: 12px;">
        <i class="fa-solid fa-spinner fa-spin fa-2x" style="color: var(--primary-blue);"></i>
        <p style="margin-top: 1rem; color: var(--text-muted);">Memuat berkas akademik...</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/mahasiswa/portal-data', {
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
    currentStudent = data.mahasiswa;
    currentPortals = data.portals;

    renderStudentProfile(currentStudent);
    renderMahasiswaJadwal(data.jadwal || []);
    renderProgressTracker(currentPortals);
    renderPortals(currentPortals);
  } catch (err) {
    console.error(err);
    if (container) {
      container.innerHTML = `
        <div class="alert-box alert-danger" style="display: block;">
          Gagal memuat data portal. Silakan refresh halaman atau login kembali.
        </div>
      `;
    }
  }
}

// Render profile info & HD avatar
function renderStudentProfile(mhs) {
  document.getElementById('navStudentName').textContent = mhs.nama;
  document.getElementById('navStudentNim').textContent = `NIM: ${mhs.nim}`;
  document.getElementById('studentFullName').textContent = mhs.nama;
  document.getElementById('chipNim').innerHTML = `<i class="fa-solid fa-id-card"></i> NIM: ${mhs.nim}`;
  document.getElementById('chipProdi').innerHTML = `<i class="fa-solid fa-book-open"></i> ${mhs.prodi || 'Psikologi'}`;
  document.getElementById('chipAngkatan').innerHTML = `<i class="fa-solid fa-calendar"></i> Angkatan: ${mhs.angkatan}`;
  document.getElementById('studentThesisTitle').textContent = mhs.judulSkripsi || 'Judul skripsi belum diinput';

  // Avatar Photo or Initials
  const avatarEl = document.getElementById('avatarInitial');
  if (avatarEl) {
    if (mhs.fotoProfil) {
      avatarEl.innerHTML = `<img src="${mhs.fotoProfil}" alt="${mhs.nama}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
    } else {
      const initials = mhs.nama
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      avatarEl.textContent = initials || 'M';
    }
  }
}

// Render Card Jadwal Ujian Mahasiswa
function renderMahasiswaJadwal(jadwalList) {
  const badgeEl = document.getElementById('mhsJadwalBadge');
  const contentEl = document.getElementById('mhsJadwalContent');
  if (!contentEl) return;

  if (!Array.isArray(jadwalList) || jadwalList.length === 0) {
    if (badgeEl) badgeEl.style.display = 'none';
    contentEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem; color: #64748b;">
        <i class="fa-solid fa-circle-info" style="color: #94a3b8; font-size: 1.1rem;"></i>
        <span>Belum ada jadwal ujian yang diagendakan oleh dosen pembimbing. Pantau terus status berkas Anda.</span>
      </div>
    `;
    return;
  }

  // Cari jadwal terdekat yang statusnya TERJADWAL, atau yang paling baru
  const activeJadwal = jadwalList.find((j) => j.status === 'TERJADWAL') || jadwalList[0];
  const tgl = new Date(activeJadwal.tanggal).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (badgeEl) {
    badgeEl.className = `badge-exam badge-exam-${activeJadwal.jenis}`;
    badgeEl.textContent = `${activeJadwal.jenis} (${activeJadwal.status})`;
    badgeEl.style.display = 'inline-flex';
  }

  contentEl.innerHTML = `
    <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem;">
        <span style="font-size: 1rem; font-weight: 700; color: var(--primary-navy);">
          <i class="fa-solid fa-graduation-cap" style="color: var(--primary-blue);"></i> Pelaksanaan Ujian ${activeJadwal.jenis}
        </span>
        <span style="font-size: 0.75rem; color: #10b981; font-weight: 700; background: #ecfdf5; padding: 0.2rem 0.55rem; border-radius: 4px;">
          Status: ${activeJadwal.status}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.6rem; margin-top: 0.35rem; font-size: 0.85rem;">
        <div><i class="fa-regular fa-calendar" style="color: var(--primary-blue); width: 16px;"></i> Tanggal: <strong>${tgl}</strong></div>
        <div><i class="fa-regular fa-clock" style="color: var(--primary-blue); width: 16px;"></i> Pukul: <strong>${escapeHtml(activeJadwal.jam)} WITA</strong></div>
        <div><i class="fa-solid fa-location-dot" style="color: var(--primary-blue); width: 16px;"></i> Ruangan: <strong>${escapeHtml(activeJadwal.ruangan)}</strong></div>
      </div>
      ${activeJadwal.catatan ? `
        <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-color); font-size: 0.8rem; color: #475569;">
          <strong><i class="fa-solid fa-circle-exclamation" style="color: #d97706;"></i> Catatan Khusus Dosen:</strong> ${escapeHtml(activeJadwal.catatan)}
        </div>
      ` : ''}
    </div>
  `;
}

// Trigger File Input untuk Foto Profil
function triggerPhotoUpload() {
  const input = document.getElementById('avatarFileInput');
  if (input) input.click();
}

// Handle Photo Selected & Client-Side Compress ke 400x400 HD
function handlePhotoSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire({
      icon: 'warning',
      title: 'Format Tidak Sesuai',
      text: 'Harap pilih file gambar (JPG, PNG, atau WEBP).',
      confirmButtonColor: '#0d2346',
    });
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      // Client-side crop & resize ke 400x400 HD (persegi, proporsional)
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');

      // Aspect ratio crop cover (center)
      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, 400, 400);

      // Export JPEG quality 0.9 (HD & tajam, ~40-60KB sangat hemat & tidak menumpuk)
      const base64Photo = canvas.toDataURL('image/jpeg', 0.9);

      // Kirim ke server
      Swal.fire({
        title: 'Mengunggah Foto Profil...',
        html: 'Mengompresi ke 400x400 HD & menyimpan foto...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const res = await fetch('/api/mahasiswa/foto', {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ fotoProfil: base64Photo }),
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.message || 'Gagal menyimpan foto profil.');
        }

        if (currentStudent) {
          currentStudent.fotoProfil = base64Photo;
        }

        renderStudentProfile(currentStudent);

        Swal.fire({
          icon: 'success',
          title: 'Foto Profil Diperbarui!',
          text: 'Foto profil HD Anda berhasil disimpan dan disinkronkan real-time.',
          timer: 1800,
          showConfirmButton: false,
        });
      } catch (err) {
        console.error(err);
        Swal.fire({
          icon: 'error',
          title: 'Gagal Mengunggah',
          text: err.message || 'Terjadi kesalahan saat mengunggah foto profil.',
          confirmButtonColor: '#0d2346',
        });
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Render progress tracker card
function renderProgressTracker(portals) {
  if (!Array.isArray(portals) || portals.length === 0) return;

  const total = portals.length;
  let approvedCount = 0;
  let pendingCount = 0;
  let revisionCount = 0;

  portals.forEach((p) => {
    const status = (p.submission && p.submission.status) || 'EMPTY';
    if (status === 'APPROVED') approvedCount++;
    if (status === 'PENDING') pendingCount++;
    if (status === 'REVISION') revisionCount++;
  });

  const percentage = Math.round((approvedCount / total) * 100);

  const fillEl = document.getElementById('progressBarFill');
  const percentEl = document.getElementById('progressPercentageText');
  const summaryEl = document.getElementById('progressSummaryText');
  const stepsEl = document.getElementById('progressStepsContainer');

  if (fillEl) fillEl.style.width = `${percentage}%`;
  if (percentEl) percentEl.textContent = `${percentage}%`;

  if (summaryEl) {
    let summaryExtra = '';
    if (revisionCount > 0) {
      summaryExtra = ` • <span style="color: #dc2626; font-weight: 700;">${revisionCount} tahap perlu perbaikan (revisi)</span>`;
    } else if (pendingCount > 0) {
      summaryExtra = ` • <span style="color: #d97706; font-weight: 700;">${pendingCount} tahap menunggu verifikasi</span>`;
    } else if (approvedCount === total) {
      summaryExtra = ` • <span style="color: #059669; font-weight: 700;">🎉 Seluruh tahapan telah disetujui!</span>`;
    }

    summaryEl.innerHTML = `${approvedCount} dari ${total} tahapan disetujui (ACC)${summaryExtra}`;
  }

  if (stepsEl) {
    stepsEl.innerHTML = portals
      .map((p, idx) => {
        const sub = p.submission || {};
        const statusKey = sub.status || 'EMPTY';
        const meta = STATUS_META[statusKey] || STATUS_META.EMPTY;
        const shortName = p.nama ? p.nama.split(':')[0].trim() : `Portal ${idx + 1}`;

        return `
        <span class="badge-status ${meta.cls}" style="font-size: 0.7rem; padding: 0.25rem 0.65rem; border-radius: 999px;">
          <i class="${meta.icon}"></i> <strong>${escapeHtml(shortName)}:</strong> ${meta.label}
        </span>
      `;
      })
      .join('');
  }
}

// Modal Edit Judul Skripsi oleh Mahasiswa
async function openEditJudulModal() {
  const currentJudul = currentStudent ? (currentStudent.judulSkripsi || '') : '';

  const { value: newJudul } = await Swal.fire({
    title: '<i class="fa-solid fa-graduation-cap" style="color: #0284c7;"></i> Judul Skripsi / Tugas Akhir',
    html: `
      <div style="text-align: left; font-size: 0.85rem;">
        <p style="color: #64748b; margin-bottom: 0.75rem;">
          Masukkan rencana atau perubahan judul skripsi Anda. Perubahan akan langsung tersinkronisasi ke Dosen Pembimbing secara real-time.
        </p>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-weight: 700; color: #1e293b; display: block; margin-bottom: 0.35rem;">
            Rencana / Judul Skripsi Lengkap:
          </label>
          <textarea id="swal-student-judul" class="swal2-textarea" style="width: 100%; margin: 0; box-sizing: border-box; font-size: 0.85rem; min-height: 90px; line-height: 1.4; border-radius: 8px;" placeholder="Contoh: Rancang Bangun Sistem Informasi Monitoring Skripsi Berbasis Web Menggunakan Node.js dan PostgreSQL...">${escapeHtml(currentJudul)}</textarea>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Simpan Judul',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#0d2346',
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const val = document.getElementById('swal-student-judul').value.trim();
      return val;
    }
  });

  if (newJudul === undefined) return;

  try {
    const res = await fetch('/api/mahasiswa/judul', {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ judulSkripsi: newJudul }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: data.message || 'Gagal mengubah judul skripsi.',
        confirmButtonColor: '#0d2346'
      });
      return;
    }

    if (currentStudent) {
      currentStudent.judulSkripsi = data.judulSkripsi;
    }

    document.getElementById('studentThesisTitle').textContent = data.judulSkripsi || 'Judul skripsi belum diinput';

    Swal.fire({
      icon: 'success',
      title: 'Judul Skripsi Disimpan!',
      text: 'Judul skripsi Anda telah diperbarui dan langsung tersinkronisasi ke Dosen Pembimbing.',
      timer: 2500,
      showConfirmButton: false
    });
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Gagal menghubungi server.',
      confirmButtonColor: '#0d2346'
    });
  }
}

// Render portals accordion
function renderPortals(portals) {
  const container = document.getElementById('portalsContainer');
  if (!container) return;

  let html = '';

  portals.forEach((p, idx) => {
    const sub = p.submission || {};
    const statusKey = sub.status || 'EMPTY';
    const meta = STATUS_META[statusKey] || STATUS_META.EMPTY;
    const portalNum = idx + 1;

    html += `
      <div class="portal-card" id="card-${p.id}">
        <!-- Header -->
        <div class="portal-header" onclick="togglePortalBody('${p.id}')">
          <div class="portal-title-grp">
            <div class="portal-num-badge">P${portalNum}</div>
            <div class="portal-info">
              <h3>${p.nama}</h3>
              <p>${p.deskripsi}</p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <span class="badge-status ${meta.cls}" id="badge-${p.id}">
              <i class="${meta.icon}"></i> ${meta.label}
            </span>
            <i class="fa-solid fa-chevron-down" id="chevron-${p.id}" style="color: var(--text-muted); transition: transform 0.2s;"></i>
          </div>
        </div>

        <!-- Body -->
        <div class="portal-body" id="body-${p.id}">
          
          <!-- Box Catatan Koreksi Dosen (jika ada) -->
          ${
            sub.catatanDosen
              ? `
            <div class="revision-note-card">
              <div class="rev-head">
                <i class="fa-solid fa-comment-dots"></i> 
                Catatan Dosen (${sub.verifiedBy || 'Dosen Pembimbing'}):
              </div>
              <div class="rev-text">${escapeHtml(sub.catatanDosen)}</div>
            </div>
          `
              : ''
          }

          <!-- Checklist Panduan Berkas & Standar Penamaan File -->
          <div class="guide-box">
            <div class="guide-box-header">
              <h4>
                <i class="fa-solid fa-list-check" style="color: var(--primary-blue);"></i> 
                Daftar Berkas yang Wajib Ada di Dalam Google Drive:
              </h4>
              <span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">
                *Ubah nama file Anda di Drive sesuai format agar mudah diperiksa dosen
              </span>
            </div>

            <ul class="file-requirements-list">
              ${p.berkas
                .map((b) => {
                  const formatWithNim = b.formatContoh.replace('[NIM]', currentStudent ? currentStudent.nim : 'NIM');
                  return `
                  <li class="file-item">
                    <div class="file-item-header">
                      <span class="file-num">${b.nomor}</span>
                      <div>
                        <div class="file-name">${b.nama}</div>
                        <div class="file-desc">${b.keterangan}</div>
                      </div>
                    </div>
                    <div class="file-naming-guide">
                      <span>Format nama file: <code>${formatWithNim}</code></span>
                      <button class="btn-copy-format" onclick="copyFormatText('${formatWithNim}', this)">
                        <i class="fa-regular fa-copy"></i> Salin
                      </button>
                    </div>
                  </li>
                `;
                })
                .join('')}
            </ul>
          </div>

          <!-- Slot Pengumpulan Link Google Drive -->
          <div class="submission-box">
            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--primary-navy); margin-bottom: 0.4rem;">
              <i class="fa-brands fa-google-drive" style="color: #059669; font-size: 1rem; margin-right: 0.35rem;"></i>
              Tautan (URL) Folder Google Drive:
            </label>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              Masukkan tautan folder Google Drive yang memuat seluruh berkas di atas. Pastikan izin akses folder: <strong>"Siapa saja yang memiliki link dapat melihat"</strong>.
            </p>

            <form onsubmit="handleSaveDriveLink(event, '${p.id}')">
              <div class="submission-input-grp">
                <input 
                  type="url" 
                  id="inputDrive-${p.id}" 
                  placeholder="https://drive.google.com/drive/folders/..." 
                  value="${sub.driveUrl ? escapeHtml(sub.driveUrl) : ''}" 
                  required
                >
                <button type="submit" class="btn-submit-link" id="btnSave-${p.id}">
                  <i class="fa-solid fa-floppy-disk"></i>
                  <span>Simpan / Perbarui Tautan</span>
                </button>
              </div>
            </form>

            ${
              sub.driveUrl
                ? `
              <div class="current-link-preview">
                <span>Tautan tersimpan saat ini:</span>
                <a href="${escapeHtml(sub.driveUrl)}" target="_blank" rel="noopener noreferrer">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka Folder di Google Drive
                </a>
              </div>
            `
                : ''
            }
          </div>

        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Toggle accordion
function togglePortalBody(portalId) {
  const body = document.getElementById(`body-${portalId}`);
  const chevron = document.getElementById(`chevron-${portalId}`);
  if (!body) return;

  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  } else {
    body.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(-90deg)';
  }
}

// Copy file naming format
function copyFormatText(text, btnElement) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = `<i class="fa-solid fa-check"></i> Tersalin!`;
    btnElement.style.background = '#10b981';
    btnElement.style.color = '#ffffff';
    setTimeout(() => {
      btnElement.innerHTML = originalText;
      btnElement.style.background = '';
      btnElement.style.color = '';
    }, 1500);
  });
}

// Submit Drive URL
async function handleSaveDriveLink(event, portalId) {
  event.preventDefault();
  const input = document.getElementById(`inputDrive-${portalId}`);
  const btn = document.getElementById(`btnSave-${portalId}`);
  const driveUrl = input.value.trim();

  if (!driveUrl) return;

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

  try {
    const res = await fetch('/api/mahasiswa/submit', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ portal: portalId, driveUrl }),
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Menyimpan',
        text: data.message || 'Gagal menyimpan tautan berkas.',
        confirmButtonColor: '#0d2346'
      });
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan / Perbarui Tautan</span>`;
      return;
    }

    // Berhasil, perbarui badge
    const badge = document.getElementById(`badge-${portalId}`);
    if (badge) {
      badge.className = 'badge-status badge-PENDING';
      badge.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> MENUNGGU PEMERIKSAAN`;
    }

    Swal.fire({
      icon: 'success',
      title: 'Tautan Tersimpan!',
      text: 'Link Google Drive Anda telah berhasil dikirim ke Dosen Pembimbing untuk diperiksa.',
      timer: 2500,
      showConfirmButton: false
    });

    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Tersimpan!</span>`;
    setTimeout(() => {
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan / Perbarui Tautan</span>`;
    }, 2000);

    // Refresh data untuk memperbarui link preview
    loadPortalData(false);
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Koneksi Gagal',
      text: 'Gagal menghubungkan ke server.',
      confirmButtonColor: '#0d2346'
    });
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Simpan / Perbarui Tautan</span>`;
  }
}

// Logout
async function handleLogout() {
  const result = await Swal.fire({
    title: 'Keluar dari Portal?',
    text: 'Apakah Anda yakin ingin mengakhiri sesi mahasiswa?',
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
