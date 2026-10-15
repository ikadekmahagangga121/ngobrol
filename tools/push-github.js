'use strict';

// Unggah seluruh proyek ini ke GitHub dalam sekali jalan:
//   1. membuat repository (kalau belum ada)
//   2. menyiapkan git: init -> commit -> push
//
//   set GITHUB_TOKEN=token_github_anda
//   node tools/push-github.js                 -> repo privat (nama: ngobrol)
//   node tools/push-github.js --publik        -> repo publik
//   node tools/push-github.js --nama ngobrol --pesan "pesan commit"
//   node tools/push-github.js --paksa        -> menimpa isi repo di GitHub
//
// Praktisnya: jalankan 10-PUSH-KE-GITHUB.bat (token dimasukkan di jendela itu,
// tidak lewat chat).
//
// Token TIDAK disimpan ke mana pun: hanya dipakai selama perintah ini berjalan
// dan tidak pernah ditulis ke .git/config atau ke output.
//
// Rahasia otomatis tidak ikut karena ada di .gitignore (database, APK, ID gist).
//
// Hook untuk pengujian (dipakai tools/uji-github.js):
//   GITHUB_API     ganti alamat API (server tiruan)
//   GIT_BIN        ganti letak program git
//   GIT_PUSH_URL   ganti tujuan push

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const AKAR = path.join(__dirname, '..');
const API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
const HOST = process.env.GITHUB_HOST || 'github.com';
const CABANG = 'main';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function ambilArg(nama, bawaan) {
  const i = process.argv.indexOf(nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
}

const namaRepo = ambilArg('--nama', 'ngobrol');
const publik = process.argv.includes('--publik');
const paksa = process.argv.includes('--paksa');
const pesanCommit = ambilArg('--pesan',
  'Ngobrol - aplikasi chat lintas platform (Android, CMD/Termux, server LAN + Cloudflare)');

function pesanGagal(teks) {
  console.error(`\n  [X] ${bersihkan(teks)}\n`);
  process.exit(1);
}

/** Jangan pernah tampilkan token ke layar. */
function bersihkan(teks) {
  const t = String(teks == null ? '' : teks);
  return token ? t.split(token).join('***') : t;
}

function panggil(metode, jalur, body) {
  return fetch(`${API}${jalur}`, {
    method: metode,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ngobrol-push-github',
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    let data = null;
    try { data = await res.json(); } catch { /* mungkin kosong */ }
    return { status: res.status, data };
  });
}

function jelaskan(status) {
  if (status === 401) return 'Token salah atau sudah kedaluwarsa.';
  if (status === 403) return 'Token kurang izin - centang cakupan "repo" saat membuat token.';
  if (status === 404) return 'Tidak ditemukan di GitHub.';
  if (status === 422) return 'Data ditolak GitHub (nama repo mungkin tidak sah / sudah dipakai).';
  return `GitHub membalas kode ${status}.`;
}

// ---------------------------------------------------------------- pengaman

// Berkas yang tidak boleh ikut terunggah, apa pun yang terjadi.
const NAMA_TERLARANG = [
  /^data\//i, /\.db$/i, /(^|\/)\.env$/i, /\.dev\.vars$/i, /gist-id\.txt$/i,
  /\.apk$/i, /^\.wrangler\//i, /\.pem$/i, /(^|\/)id_rsa/i, /\.ppk$/i,
];

// Isi berkas yang menandakan rahasia (token/sandi/kunci).
const ISI_TERLARANG = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, sebut: 'kunci privat' },
  { re: /\bghp_[A-Za-z0-9]{20,}/, sebut: 'token GitHub' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, sebut: 'token GitHub' },
  { re: /\bsk-[A-Za-z0-9]{20,}/, sebut: 'kunci rahasia (sk-)' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, sebut: 'kunci AWS' },
  { re: /CLOUDFLARE_API_TOKEN\s*=\s*["']?[A-Za-z0-9_-]{10,}/, sebut: 'token Cloudflare' },
];

/** Periksa berkas yang siap dikirim - batalkan kalau ada rahasia. */
function periksaRahasia(daftar) {
  const temuan = [];
  for (const f of daftar) {
    if (NAMA_TERLARANG.some((re) => re.test(f))) {
      temuan.push(`${f} - berkas ini tidak boleh ikut`);
      continue;
    }
    let isi = '';
    try {
      const penuh = path.join(AKAR, f);
      if (fs.statSync(penuh).size > 1024 * 1024) continue; // berkas besar dilewati
      isi = fs.readFileSync(penuh, 'utf8');
    } catch { continue; }
    for (const { re, sebut } of ISI_TERLARANG) {
      if (re.test(isi)) { temuan.push(`${f} - berisi ${sebut}`); break; }
    }
  }
  if (temuan.length) {
    pesanGagal('Ada RAHASIA yang hampir ikut terunggah - pengiriman dibatalkan:\n' +
      temuan.map((t) => `     - ${t}`).join('\n') +
      '\n     Hapus/pindahkan rahasia itu dulu, lalu jalankan lagi.');
  }
}

// ---------------------------------------------------------------- git

function cariGit() {
  const kandidat = [
    process.env.GIT_BIN,
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    '/usr/bin/git',
    '/usr/local/bin/git',
  ].filter(Boolean);

  for (const k of kandidat) {
    const r = spawnSync(k, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return k;
  }
  return null;
}

const GIT = cariGit();

function git(args, { izinkanGagal = false } = {}) {
  if (!GIT) return { kode: 1, teks: 'git tidak ditemukan' };
  const r = spawnSync(GIT, args, {
    cwd: AKAR,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const teks = bersihkan(`${r.stdout || ''}${r.stderr || ''}`).trim();
  const kode = typeof r.status === 'number' ? r.status : 1;
  if (kode !== 0 && !izinkanGagal) {
    pesanGagal(`Perintah git gagal: git ${args.filter((a) => !a.includes(token)).join(' ')}\n     ${teks.split('\n').join('\n     ')}`);
  }
  return { kode, teks };
}

function sudahRepo() {
  const r = git(['rev-parse', '--is-inside-work-tree'], { izinkanGagal: true });
  return r.kode === 0 && r.teks.includes('true');
}

// ---------------------------------------------------------------- jalan

const langkah = (n, teks) => console.log(`\n  [${n}] ${teks}`);

(async () => {
  if (!token) {
    pesanGagal('Token GitHub belum diisi.\n' +
      '     Set dulu:  set GITHUB_TOKEN=token_anda\n' +
      '     (atau jalankan 10-PUSH-KE-GITHUB.bat)');
  }
  if (!GIT) {
    pesanGagal('Program "git" tidak ditemukan.\n' +
      '     Pasang sekali di https://gitforwindows.org lalu buka jendela ini lagi.');
  }

  console.log(`\n  Mengunggah proyek ke GitHub (repo ${publik ? 'publik' : 'privat'}: ${namaRepo})...`);

  // 1. Pastikan token benar + ambil nama akun.
  langkah(1, 'Memeriksa token GitHub...');
  const aku = await panggil('GET', '/user');
  if (aku.status !== 200) pesanGagal(jelaskan(aku.status));
  const login = aku.data.login;
  const emailNoReply = `${aku.data.id}+${login}@users.noreply.github.com`;
  console.log(`     Masuk sebagai: ${login}`);

  // 2. Buat repository kalau belum ada.
  langkah(2, 'Menyiapkan repository...');
  const ada = await panggil('GET', `/repos/${login}/${namaRepo}`);
  if (ada.status === 200) {
    console.log(`     Repository sudah ada: ${ada.data.html_url}`);
    if (Boolean(ada.data.private) !== !publik) {
      console.log(`     Catatan: repo itu sekarang ${ada.data.private ? 'privat' : 'publik'}, pilihanmu ${publik ? 'publik' : 'privat'}.`);
      console.log('     Ubah di GitHub: Settings > General > Danger Zone > Change visibility.');
    }
  } else if (ada.status === 404) {
    const buat = await panggil('POST', '/user/repos', {
      name: namaRepo,
      private: !publik,
      description: 'Aplikasi chat lintas platform: Android (Flutter), CMD/Termux (cli.js), server LAN + Cloudflare. Bahasa Indonesia.',
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    });
    if (buat.status !== 201) pesanGagal(jelaskan(buat.status));
    console.log(`     Repository dibuat: ${buat.data.html_url}`);
  } else {
    pesanGagal(jelaskan(ada.status));
  }

  const urlBersih = `https://${HOST}/${login}/${namaRepo}.git`;
  const urlPush = process.env.GIT_PUSH_URL || `https://x-access-token:${token}@${HOST}/${login}/${namaRepo}.git`;

  // 3. Siapkan repo lokal.
  langkah(3, 'Menyiapkan git di komputer ini...');
  if (!sudahRepo()) {
    git(['init']);
    git(['config', 'user.name', login]);
    git(['config', 'user.email', emailNoReply]);
    console.log('     Repo git lokal dibuat.');
  } else {
    console.log('     Repo git lokal sudah ada - dilanjutkan.');
    git(['config', 'user.name', login]);
    git(['config', 'user.email', emailNoReply]);
  }

  // 4. Masukkan berkas (rahasia otomatis dilewati lewat .gitignore).
  langkah(4, 'Mengumpulkan berkas...');
  git(['add', '-A']);
  const daftar = git(['diff', '--cached', '--name-only']).teks.split('\n').filter(Boolean);
  periksaRahasia(daftar);
  const totalByte = daftar.reduce((n, f) => {
    try { return n + fs.statSync(path.join(AKAR, f)).size; } catch { return n; }
  }, 0);
  console.log(`     ${daftar.length} berkas (${(totalByte / 1024 / 1024).toFixed(2)} MB) siap dikirim.`);
  console.log('     Tidak ikut: Ngobrol.apk, database, tools/gist-id.txt (lihat .gitignore)');
  if (daftar.length === 0) {
    console.log('     Tidak ada perubahan baru - data di GitHub sudah paling baru.');
  }

  // 5. Commit.
  if (daftar.length > 0) {
    langkah(5, 'Menyimpan perubahan (commit)...');
    git(['commit', '-m', pesanCommit]);
    console.log('     Commit dibuat.');
  }

  const cabangSekarang = git(['rev-parse', '--abbrev-ref', 'HEAD'], { izinkanGagal: true }).teks.trim();
  if (cabangSekarang && cabangSekarang !== CABANG && /^[\w.\/-]+$/.test(cabangSekarang)) {
    git(['branch', '-M', CABANG]);
  }

  // 6. Hubungkan ke GitHub.
  langkah(6, 'Menghubungkan ke GitHub...');
  const remoteLama = git(['remote', 'get-url', 'origin'], { izinkanGagal: true });
  if (remoteLama.kode === 0 && remoteLama.teks) {
    if (remoteLama.teks.trim() !== urlBersih) git(['remote', 'set-url', 'origin', urlBersih]);
  } else {
    git(['remote', 'add', 'origin', urlBersih]);
  }
  console.log(`     Tujuan: ${urlBersih}`);

  // 7. Kirim.
  langkah(7, 'Mengirim ke GitHub...');
  const kirim = git(['-c', 'credential.helper=', 'push', ...(paksa ? ['--force'] : []), urlPush, `${CABANG}:${CABANG}`], { izinkanGagal: true });
  if (kirim.kode !== 0) {
    const t = kirim.teks;
    if (/non-fast-forward|rejected|fetch first/i.test(t)) {
      pesanGagal('GitHub menolak karena repo sudah punya isi lain.\n' +
        '     Pilihan: (a) hapus repo itu di GitHub lalu jalankan lagi,\n' +
        '     atau (b) jalankan lagi dengan tambahan --paksa (menimpa isi GitHub).');
    }
    if (/Authentication failed|403|could not read Username|terminal prompts disabled/i.test(t)) {
      pesanGagal('Gagal masuk ke GitHub. Pastikan token benar dan punya cakupan "repo".');
    }
    pesanGagal(`Gagal mengirim.\n     ${t.split('\n').slice(-6).join('\n     ')}`);
  }
  console.log('     Terkirim.');

  // 8. Ringkasan.
  const hal = `https://${HOST}/${login}/${namaRepo}`;
  console.log('\n  [OK] Berhasil diunggah ke GitHub!');
  console.log(`\n  Halaman repo : ${hal}`);
  console.log(`  Berkas       : ${daftar.length} berkas`);
  console.log(`  Sifat        : ${publik ? 'publik (siapa pun bisa lihat)' : 'privat (hanya Anda)'}`);
  console.log(`  Clone        : git clone ${urlBersih}`);
  console.log('\n  Mau memperbarui lagi nanti? Jalankan 10-PUSH-KE-GITHUB.bat lagi.');
  console.log('  Token tidak disimpan - jadi aman.\n');
})().catch((e) => pesanGagal(`Tidak bisa menghubungi GitHub: ${e.message}`));
