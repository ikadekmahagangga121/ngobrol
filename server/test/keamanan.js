'use strict';

// Uji keamanan server lokal (Node) — jalan SENDIRI, tidak perlu server terpisah.
//
//   node test/keamanan.js
//
// Server uji dijalankan di port 8099 dengan database sementara dan batas
// keamanan yang kecil supaya cepat diuji (lihat env di bawah).

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const WebSocket = require('ws');

const PORT = Number(process.env.UJI_PORT) || 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'ngobrol-uji-'));
const fileDb = path.join(dirData, 'uji.db');

let lulus = 0;
let gagal = 0;
function cek(nama, ok, detail = '') {
  if (ok) { lulus++; console.log(`  ✔ ${nama}`); }
  else { gagal++; console.log(`  ✘ ${nama} ${detail}`); }
}

const anak = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_FILE: fileDb,
    BCRYPT_COST: '4', // cepat untuk uji (asli: 12)
    LOGIN_MAKS: '3',
    REGISTER_MAKS: '6',
    MAKS_KIRIM: '5',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

async function api(path, { method = 'POST', body, token, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch { /* bukan JSON */ }
  return { status: res.status, data };
}

function sambung(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    const masuk = [];
    ws.on('message', (raw) => { try { masuk.push(JSON.parse(raw)); } catch { /* abaikan */ } });
    ws.on('open', () => resolve({ ws, masuk, tunggu: (ms) => new Promise((r) => setTimeout(r, ms)) }));
    ws.on('error', reject);
  });
}

async function tungguSehat() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function bersihkan() {
  try { anak.kill(); } catch { /* sudah mati */ }
  try { fs.rmSync(dirData, { recursive: true, force: true }); } catch { /* file masih dipakai */ }
}

(async () => {
  console.log('\nUji keamanan server lokal (Node)\n');

  if (!await tungguSehat()) {
    console.error('  ✘ Server uji tidak mau hidup di port ' + PORT);
    bersihkan();
    process.exit(1);
  }

  // --- header pengaman
  const sehat = await api('/api/health', { method: 'GET', raw: true });
  cek('respons punya header nosniff', sehat.headers.get('x-content-type-options') === 'nosniff');
  cek('respons punya header frame-ancestors (X-Frame-Options)',
    sehat.headers.get('x-frame-options') === 'DENY');

  // --- batas pendaftaran (REGISTER_MAKS=6 pada uji ini):
  //     percobaan ke-1..3 berhasil, ke-4..6 gagal validasi/dobel, ke-7 dst diblokir.
  const u1 = await api('/api/register', { body: { username: 'uji_satu', password: 'rahasia1' } });
  const u2 = await api('/api/register', { body: { username: 'uji_dua', password: 'rahasia1' } });
  const u3 = await api('/api/register', { body: { username: 'uji_tiga', password: 'rahasia1' } });
  cek('pendaftaran 1-3 diterima', u1.status === 201 && u2.status === 201 && u3.status === 201,
    `${u1.status}/${u2.status}/${u3.status}`);

  const sandiPendek = await api('/api/register', { body: { username: 'uji_pendek', password: '123' } });
  cek('kata sandi < 6 karakter ditolak 400', sandiPendek.status === 400, JSON.stringify(sandiPendek.data));

  const sandiPanjang = await api('/api/register', { body: { username: 'uji_panjang', password: 'x'.repeat(73) } });
  cek('kata sandi > 72 karakter ditolak 400', sandiPanjang.status === 400, JSON.stringify(sandiPanjang.data));

  const namaDobel = await api('/api/register', { body: { username: 'UJI_SATU', password: 'rahasia1' } });
  cek('nama pengguna dobel (beda huruf besar/kecil) ditolak 409', namaDobel.status === 409, JSON.stringify(namaDobel.data));

  const u4 = await api('/api/register', { body: { username: 'uji_empat', password: 'rahasia1' } });
  cek('pendaftaran melewati batas diblokir 429', u4.status === 429, JSON.stringify(u4.data));

  const u5 = await api('/api/register', { body: { username: 'uji_lima', password: 'rahasia1' } });
  cek('percobaan berikutnya tetap diblokir 429', u5.status === 429, JSON.stringify(u5.data));

  // --- login
  const masuk = await api('/api/login', { body: { username: 'uji_satu', password: 'rahasia1' } });
  cek('login benar berhasil', masuk.status === 200 && String(masuk.data?.token || '').length === 64);

  const token = masuk.data.token;
  const tanpaToken = await api('/api/me', { method: 'GET' });
  cek('tanpa token ditolak 401', tanpaToken.status === 401);

  // --- ganti kata sandi
  const tanpaLogin = await api('/api/change-password', { body: { oldPassword: 'rahasia1', newPassword: 'rahasia2' } });
  cek('ganti kata sandi tanpa login ditolak 401', tanpaLogin.status === 401);

  const perangkat2 = await api('/api/login', { body: { username: 'uji_satu', password: 'rahasia1' } });
  cek('perangkat kedua berhasil masuk', perangkat2.status === 200 && !!perangkat2.data?.token);

  const lamaSalah = await api('/api/change-password', {
    token, body: { oldPassword: 'salahsekali', newPassword: 'rahasia2' },
  });
  cek('sandi lama salah → 401', lamaSalah.status === 401);

  const baruPendek = await api('/api/change-password', {
    token, body: { oldPassword: 'rahasia1', newPassword: '123' },
  });
  cek('sandi baru terlalu pendek → 400', baruPendek.status === 400);

  const ganti = await api('/api/change-password', {
    token, body: { oldPassword: 'rahasia1', newPassword: 'rahasia2' },
  });
  cek('ganti kata sandi berhasil', ganti.status === 200 && ganti.data?.ok === true, JSON.stringify(ganti.data));

  const perangkat2Lagi = await api('/api/me', { method: 'GET', token: perangkat2.data.token });
  cek('perangkat lain otomatis keluar', perangkat2Lagi.status === 401);

  const iniMasih = await api('/api/me', { method: 'GET', token });
  cek('perangkat yang mengganti sandi tetap masuk', iniMasih.status === 200);

  const masukBaru = await api('/api/login', { body: { username: 'uji_satu', password: 'rahasia2' } });
  cek('login dengan sandi baru berhasil', masukBaru.status === 200 && !!masukBaru.data?.token);

  const tokenBaru = masukBaru.data.token;

  // --- hash lama (biaya rendah) otomatis diperkuat saat login
  const bcrypt = require('bcryptjs');
  const dbLangsung = new DatabaseSync(fileDb);
  dbLangsung.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run('uji_lama', bcrypt.hashSync('rahasia1', 2), Date.now());

  const masukLama = await api('/api/login', { body: { username: 'uji_lama', password: 'rahasia1' } });
  cek('user dengan hash lama bisa masuk', masukLama.status === 200 && !!masukLama.data?.token);

  const hashBaru = dbLangsung.prepare('SELECT password_hash FROM users WHERE username = ?').get('uji_lama');
  cek('hash lama dinaikkan ke biaya bcrypt server',
    bcrypt.getRounds(hashBaru.password_hash) === 4, `rounds=${bcrypt.getRounds(hashBaru.password_hash)}`);
  dbLangsung.close();

  // --- token kedaluwarsa (>90 hari) dibuat langsung di database
  const tokenTua = 'b'.repeat(64);
  const db = new DatabaseSync(fileDb);
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(tokenTua, masukBaru.data.user.id, Date.now() - 100 * 24 * 60 * 60 * 1000);
  db.close();

  const pakaiTua = await api('/api/me', { method: 'GET', token: tokenTua });
  cek('token kedaluwarsa (>90 hari) ditolak 401', pakaiTua.status === 401);

  // --- WebSocket: token salah, banjir pesan, pesan kepanjangan
  let kodeTutup = null;
  await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}?token=${'0'.repeat(64)}`);
    ws.on('close', (kode) => { kodeTutup = kode; resolve(); });
    ws.on('error', () => resolve());
  });
  cek('token ngawur → koneksi ditutup 4001', kodeTutup === 4001, `kode=${kodeTutup}`);

  const a = await sambung(tokenBaru);
  cek('klien sah menerima hello', await (async () => {
    await a.tunggu(1500);
    return a.masuk.some((m) => m.type === 'hello');
  })());

  a.masuk.length = 0;
  for (let i = 1; i <= 8; i++) a.ws.send(JSON.stringify({ type: 'group', text: `banjir ${i}` }));
  await a.tunggu(700);
  const terkirim = a.masuk.filter((m) => m.type === 'group' && m.text.startsWith('banjir')).length;
  cek('banjir pesan dibatasi (MAKS_KIRIM=5, dikirim 8)', terkirim <= 5 && terkirim >= 1, `terkirim=${terkirim}`);
  cek('pelaku banjir diberi tahu alasannya',
    a.masuk.some((m) => m.type === 'error' && m.error.includes('Terlalu banyak')));

  a.masuk.length = 0;
  a.ws.send(JSON.stringify({ type: 'group', text: 'x'.repeat(2001) }));
  await a.tunggu(400);
  cek('pesan > 2000 karakter ditolak dengan pesan jelas',
    a.masuk.some((m) => m.type === 'error' && m.error.includes('terlalu panjang')));

  a.ws.close();

  // --- penangkal brute-force (LOGIN_MAKS=3) — diuji paling akhir
  for (let i = 0; i < 3; i++) {
    await api('/api/login', { body: { username: 'uji_satu', password: `ngawur${i}` } });
  }
  const kunci = await api('/api/login', { body: { username: 'uji_satu', password: 'rahasia2' } });
  cek('percobaan login berulang diblokir 429', kunci.status === 429, JSON.stringify(kunci.data));

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal\n`);
  bersihkan();
  process.exit(gagal === 0 ? 0 : 1);
})().catch((err) => {
  console.error('GAGAL:', err.message);
  bersihkan();
  process.exit(1);
});
