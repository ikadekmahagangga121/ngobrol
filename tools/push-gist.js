'use strict';

// Simpan server/cli.js ke GitHub Gist supaya siapa pun bisa mengunduhnya
// lewat satu link (tanpa perlu Anda kirim file / tanpa server Anda hidup).
//
//   set GITHUB_TOKEN=token_github_anda
//   node tools/push-gist.js             -> gist rahasia (hanya yang punya link)
//   node tools/push-gist.js --publik    -> gist publik (bisa dicari orang)
//
// Cara pakai singkat: jalankan 9-SIMPAN-CLI-KE-GIST.bat (sudah otomatis).
//
// Setelah pertama kali, ID gist disimpan di tools/gist-id.txt, sehingga
// menjalankan lagi akan MEMPERBARUI gist yang sama - linknya tidak berubah.

const fs = require('node:fs');
const path = require('node:path');

const AKAR = path.join(__dirname, '..');
const SUMBER = path.join(AKAR, 'server', 'cli.js');
const BERKAS_ID = path.join(__dirname, 'gist-id.txt');
const NAMA_BERKAS = 'cli.js';
// Bisa diganti untuk pengujian (mis. server tiruan).
const API = process.env.GIST_API || 'https://api.github.com/gists';

const publik = process.argv.includes('--publik');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function pesanGagal(teks) {
  console.error(`\n  [X] ${teks}\n`);
  process.exit(1);
}

if (!token) {
  pesanGagal('Token GitHub belum diisi.\n' +
    '     Set dulu:  set GITHUB_TOKEN=token_anda\n' +
    '     (atau jalankan 9-SIMPAN-CLI-KE-GIST.bat)');
}

if (!fs.existsSync(SUMBER)) {
  pesanGagal(`Berkas tidak ditemukan: ${SUMBER}`);
}

const isi = fs.readFileSync(SUMBER, 'utf8');

async function panggil(metode, url, body) {
  const res = await fetch(url, {
    method: metode,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ngobrol-push-gist',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* mungkin kosong */ }
  return { status: res.status, data };
}

function jelaskan(status) {
  if (status === 401) return 'Token salah atau sudah kedaluwarsa.';
  if (status === 403) return 'Token kurang izin - centang kotak "gist" saat membuat token.';
  if (status === 404) return 'Gist tidak ditemukan (mungkin sudah dihapus).';
  if (status === 422) return 'Data ditolak GitHub (isi berkas kosong / terlalu besar).';
  return `GitHub membalas kode ${status}.`;
}

function tampilkanLink(data) {
  const id = data.id;
  const pemilik = (data.owner && data.owner.login) || '(akun)';
  const rahasia = data.public ? 'publik' : 'rahasia (unlisted)';
  // Tanpa bagian "sha" supaya selalu menunjuk versi terbaru.
  const raw = `https://gist.githubusercontent.com/${pemilik}/${id}/raw/${NAMA_BERKAS}`;
  console.log(`\n  [OK] Berhasil (gist ${rahasia}).`);
  console.log(`\n  Halaman gist : ${data.html_url}`);
  console.log(`  Link unduh   : ${raw}`);
  console.log('\n  Bagikan ke teman (satu baris, tempel di terminal):');
  console.log(`\n    Windows CMD :  curl.exe -O ${raw} && node cli.js`);
  console.log(`    PowerShell  :  Invoke-WebRequest ${raw} -OutFile cli.js; node cli.js`);
  console.log(`    Termux/Linux:  curl -O ${raw} && node cli.js`);
  console.log('\n  Catatan: jangan pakai "curl ... | node" - ketikan tidak akan bisa masuk.');
  console.log('  Kalau cli.js nanti diubah, jalankan lagi alat ini (link tetap sama).\n');
}

(async () => {
  let idLama = '';
  try { idLama = fs.readFileSync(BERKAS_ID, 'utf8').trim(); } catch { /* belum ada */ }

  if (idLama) {
    console.log(`\n  Memperbarui gist lama (${idLama})...`);
    const r = await panggil('PATCH', `${API}/${idLama}`, {
      files: { [NAMA_BERKAS]: { content: isi } },
    });
    if (r.status === 200) {
      tampilkanLink(r.data);
      return;
    }
    if (r.status !== 404) pesanGagal(jelaskan(r.status));
    console.log('  Gist lama tidak ada - membuat gist baru...');
  }

  console.log(`\n  Membuat gist ${publik ? 'publik' : 'rahasia'} berisi ${NAMA_BERKAS} (${(isi.length / 1024).toFixed(1)} KB)...`);
  const r = await panggil('POST', API, {
    description: 'Ngobrol - klien chat untuk CMD / PowerShell / Termux (unduh lalu: node cli.js)',
    public: publik,
    files: { [NAMA_BERKAS]: { content: isi } },
  });

  if (r.status !== 201) pesanGagal(jelaskan(r.status));

  fs.writeFileSync(BERKAS_ID, `${r.data.id}\n`, 'utf8');
  tampilkanLink(r.data);
})().catch((e) => pesanGagal(`Tidak bisa menghubungi GitHub: ${e.message}`));
