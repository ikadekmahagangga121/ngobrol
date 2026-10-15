'use strict';

// Uji tools/push-github.js TANPA internet:
//   - GitHub diganti server tiruan (menangkap permintaan yang dikirim)
//   - tujuan "push" adalah repo git lokal (bare), bukan GitHub
//   - sekaligus memastikan rahasia (APK, database, ID gist, token) tidak ikut
//
//   node tools/uji-github.js

const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AKAR = path.join(__dirname, '..');
const TOKEN_BENAR = 'token-uji-palsu-123';
// Dibuat saat jalan supaya berkas ini sendiri tidak terdeteksi sebagai rahasia.
const TOKEN_TERSEMBUNYI = 'ghp_' + 'A'.repeat(32);

let lulus = 0;
let gagal = 0;
function cek(nama, ok, detail = '') {
  if (ok) { lulus++; console.log(`  [OK] ${nama}`); }
  else { gagal++; console.log(`  [X]  ${nama} ${detail}`); }
}

function cariGit() {
  const kandidat = [
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    '/usr/bin/git',
  ];
  for (const k of kandidat) {
    const r = spawnSync(k, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return k;
  }
  return null;
}

const GIT = cariGit();

function gitDi(cwd, args) {
  const r = spawnSync(GIT, args, { cwd, encoding: 'utf8' });
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

// ---------------------------------------------------------- siapkan proyek uji

const proyek = fs.mkdtempSync(path.join(os.tmpdir(), 'ngobrol-uji-proyek-'));
const tujuan = fs.mkdtempSync(path.join(os.tmpdir(), 'ngobrol-uji-tujuan-'));
const bare = path.join(tujuan, 'tujuan.git');

fs.mkdirSync(path.join(proyek, 'tools'), { recursive: true });
fs.mkdirSync(path.join(proyek, 'server'), { recursive: true });
fs.mkdirSync(path.join(proyek, 'data'), { recursive: true });
fs.copyFileSync(path.join(AKAR, '.gitignore'), path.join(proyek, '.gitignore'));
fs.copyFileSync(path.join(AKAR, '.gitattributes'), path.join(proyek, '.gitattributes'));
fs.copyFileSync(path.join(AKAR, 'tools', 'push-github.js'), path.join(proyek, 'tools', 'push-github.js'));
fs.writeFileSync(path.join(proyek, 'README.md'), '# Ngobrol (uji)\n', 'utf8');
fs.writeFileSync(path.join(proyek, 'server', 'cli.js'), "console.log('uji');\n", 'utf8');
// Umpan: harus TIDAK ikut terunggah.
fs.writeFileSync(path.join(proyek, 'Ngobrol.apk'), 'APK palsu\n', 'utf8');
fs.writeFileSync(path.join(proyek, 'data', 'chat.db'), 'database palsu\n', 'utf8');
fs.writeFileSync(path.join(proyek, 'tools', 'gist-id.txt'), 'abc123\n', 'utf8');

// Tujuan push = repo git lokal (bukan GitHub).
gitDi(tujuan, ['init', '--bare', bare]);

// ---------------------------------------------------------- server tiruan

const catatan = [];
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const jalur = req.url.split('?')[0];
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch { /* biarkan */ }
    catatan.push({ metode: req.method, jalur, data, auth: req.headers.authorization || '' });

    const kirim = (kode, obj) => {
      res.writeHead(kode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    if (jalur === '/user') {
      if (req.headers.authorization === `Bearer ${TOKEN_BENAR}`) {
        return kirim(200, { login: 'uji_user', id: 4242, name: 'Uji User' });
      }
      return kirim(401, { message: 'Bad credentials' });
    }
    if (req.method === 'GET' && jalur.startsWith('/repos/')) return kirim(404, { message: 'Not Found' });
    if (req.method === 'POST' && jalur === '/user/repos') {
      return kirim(201, {
        full_name: `uji_user/${data && data.name}`,
        html_url: `https://github.com/uji_user/${data && data.name}`,
        private: Boolean(data && data.private),
      });
    }
    return kirim(404, {});
  });
});

function jalankan(argumen, token) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(proyek, 'tools', 'push-github.js'), ...argumen], {
      cwd: proyek,
      env: {
        ...process.env,
        GITHUB_TOKEN: token,
        GITHUB_API: `http://127.0.0.1:${srv.address().port}`,
        GIT_BIN: GIT,
        GIT_PUSH_URL: bare,
      },
    });
    let keluaran = '';
    p.stdout.on('data', (d) => { keluaran += d.toString(); });
    p.stderr.on('data', (d) => { keluaran += d.toString(); });
    p.on('close', (kode) => resolve({ kode, keluaran }));
  });
}

// ---------------------------------------------------------- mulai

(async () => {
  console.log('\nUji alat push ke GitHub (server tiruan, tanpa internet)\n');

  if (!GIT) {
    console.log('  [X]  git tidak ditemukan - uji dilewati.\n');
    process.exit(1);
  }

  await new Promise((r) => srv.listen(0, '127.0.0.1', r));

  // 1) repo privat (bawaan)
  const privat = await jalankan(['--nama', 'ngobrol-privat'], TOKEN_BENAR);
  const mintaPrivat = catatan.find((c) => c.metode === 'POST' && c.jalur === '/user/repos');
  cek('berjalan sampai selesai (repo privat)', privat.kode === 0, `kode=${privat.kode}\n${privat.keluaran}`);
  cek('membuat repo privat dengan nama benar',
    Boolean(mintaPrivat) && mintaPrivat.data.name === 'ngobrol-privat' && mintaPrivat.data.private === true,
    `data=${JSON.stringify(mintaPrivat && mintaPrivat.data)}`);
  cek('token dikirim sebagai Bearer ke GitHub',
    Boolean(mintaPrivat) && mintaPrivat.auth === `Bearer ${TOKEN_BENAR}`);

  const berkas = gitDi(proyek, ['ls-files']).split('\n');
  cek('berkas proyek ikut terkirim', berkas.includes('README.md') && berkas.includes('server/cli.js'));
  cek('APK, database, dan ID gist TIDAK ikut',
    !berkas.includes('Ngobrol.apk') && !berkas.includes('data/chat.db') && !berkas.includes('tools/gist-id.txt'),
    `terkirim=${berkas.join(',')}`);
  cek('identitas commit memakai email no-reply GitHub',
    gitDi(proyek, ['config', 'user.email']) === '4242+uji_user@users.noreply.github.com');
  cek('remote origin menunjuk repo yang benar',
    gitDi(proyek, ['remote', 'get-url', 'origin']) === 'https://github.com/uji_user/ngobrol-privat.git');
  cek('commit benar-benar sampai ke tujuan',
    gitDi(bare, ['log', '--oneline']).length > 0);
  cek('alamat repo ditampilkan ke pengguna', privat.keluaran.includes('https://github.com/uji_user/ngobrol-privat'));
  cek('token tidak pernah muncul di layar', !privat.keluaran.includes(TOKEN_BENAR));

  // 2) repo publik
  const publik = await jalankan(['--nama', 'ngobrol-publik', '--publik'], TOKEN_BENAR);
  const mintaPublik = catatan.filter((c) => c.metode === 'POST' && c.jalur === '/user/repos').pop();
  cek('repo yang sudah ada tetap bisa dikirim ulang', publik.kode === 0, `kode=${publik.kode}\n${publik.keluaran}`);
  cek('membuat repo publik dengan nama benar',
    Boolean(mintaPublik) && mintaPublik.data.name === 'ngobrol-publik' && mintaPublik.data.private === false,
    `data=${JSON.stringify(mintaPublik && mintaPublik.data)}`);
  cek('remote origin ikut berpindah ke repo baru',
    gitDi(proyek, ['remote', 'get-url', 'origin']) === 'https://github.com/uji_user/ngobrol-publik.git');

  // 3) token salah
  const salah = await jalankan(['--nama', 'ngobrol-privat'], 'token-salah');
  cek('token salah ditolak dengan pesan jelas',
    salah.kode !== 0 && salah.keluaran.includes('Token salah'), `kode=${salah.kode}`);
  cek('token salah tidak bocor ke layar', !salah.keluaran.includes('token-salah'));

  // 4) rahasia di dalam berkas
  fs.writeFileSync(path.join(proyek, 'bocor.js'), `const t = '${TOKEN_TERSEMBUNYI}';\n`, 'utf8');
  const bocor = await jalankan(['--nama', 'ngobrol-bocor'], TOKEN_BENAR);
  cek('push dibatalkan kalau ada rahasia di berkas',
    bocor.kode !== 0 && bocor.keluaran.includes('bocor.js') && /RAHASIA/i.test(bocor.keluaran),
    `kode=${bocor.kode}`);
  cek('token yang bocor tidak ditampilkan', !bocor.keluaran.includes(TOKEN_TERSEMBUNYI));
  fs.rmSync(path.join(proyek, 'bocor.js'), { force: true });

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal\n`);

  srv.close();
  try { fs.rmSync(proyek, { recursive: true, force: true }); } catch { /* biarkan */ }
  try { fs.rmSync(tujuan, { recursive: true, force: true }); } catch { /* biarkan */ }
  process.exit(gagal === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  try { srv.close(); } catch { /* biarkan */ }
  process.exit(1);
});
