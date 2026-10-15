'use strict';

// Uji lengkap server Ngobrol (versi Cloudflare maupun Node lokal).
//
//   node test/simulate.js
//   BASE_URL=https://ngobrol-server.xxx.workers.dev node test/simulate.js
//
// Tanpa dependency apa pun (memakai WebSocket bawaan Node 22+).

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');

let lulus = 0;
let gagal = 0;
function cek(nama, ok, detail = '') {
  if (ok) { lulus++; console.log(`  ✔ ${nama}`); }
  else { gagal++; console.log(`  ✘ ${nama} ${detail}`); }
}

async function api(method, path, { body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* bukan JSON */ }
  return { status: res.status, data };
}

function sambung(token) {
  const ws = new WebSocket(`${WS_BASE}/ws?token=${token}`);
  const state = { pesan: [], sidik: 'baru', siap: false, kodeTutup: null };
  ws.addEventListener('open', () => { state.siap = true; });
  ws.addEventListener('message', (e) => {
    try { state.pesan.push(JSON.parse(typeof e.data === 'string' ? e.data : String(e.data))); } catch { /* abaikan */ }
  });
  ws.addEventListener('close', (e) => { state.kodeTutup = e.code; });
  ws.addEventListener('error', () => {});
  return { ws, state };
}

async function tunggu(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  console.log(`\nUji server: ${BASE}\n`);

  // --- kesehatan
  const sehat = await api('GET', '/api/health');
  cek('GET /api/health jawab ok', sehat.status === 200 && sehat.data?.ok === true);

  // --- registrasi
  const rand = Math.floor(Math.random() * 1000000);
  const namaA = `andi_${rand}`;
  const namaB = `budi_${rand}`;

  const regA = await api('POST', '/api/register', { body: { username: namaA, password: 'rahasia1' } });
  const regB = await api('POST', '/api/register', { body: { username: namaB, password: 'rahasia1' } });
  cek('registrasi user A', regA.status === 201 && !!regA.data?.token, JSON.stringify(regA.data));
  cek('registrasi user B', regB.status === 201 && !!regB.data?.token, JSON.stringify(regB.data));

  const A = { ...regA.data.user, token: regA.data.token };
  const B = { ...regB.data.user, token: regB.data.token };

  // --- validasi
  const dobel = await api('POST', '/api/register', { body: { username: namaA, password: 'rahasia1' } });
  cek('username dobel ditolak (409)', dobel.status === 409);

  const pendek = await api('POST', '/api/register', { body: { username: 'ab', password: '123' } });
  cek('username/password tidak valid ditolak (400)', pendek.status === 400);

  const salah = await api('POST', '/api/login', { body: { username: namaA, password: 'salahbanget' } });
  cek('password salah ditolak (401)', salah.status === 401);

  const benar = await api('POST', '/api/login', { body: { username: namaA, password: 'rahasia1' } });
  cek('login benar berhasil', benar.status === 200 && !!benar.data?.token);

  const tanpaToken = await api('GET', '/api/users');
  cek('tanpa token ditolak (401)', tanpaToken.status === 401);

  // --- websocket
  const a = sambung(A.token);
  const b = sambung(B.token);
  const tersambung = await tunggu(() => a.state.siap && b.state.siap);
  cek('dua klien WebSocket tersambung', tersambung);

  const hello = await tunggu(() => a.state.pesan.some((m) => m.type === 'hello'));
  cek('menerima pesan hello', hello);

  // token ngawur → harus ditutup dengan kode 4001
  const ngawur = sambung('0'.repeat(64));
  const ditutup = await tunggu(() => ngawur.state.kodeTutup !== null);
  cek('token tidak valid ditutup (4001)', ditutup && ngawur.state.kodeTutup === 4001, `kode=${ngawur.state.kodeTutup}`);

  // --- pesan grup
  a.ws.send(JSON.stringify({ type: 'group', text: 'Halo grup dari A' }));
  const bDapatGrup = await tunggu(() => b.state.pesan.some((m) => m.type === 'group' && m.text === 'Halo grup dari A'));
  cek('B menerima pesan grup dari A', bDapatGrup);

  // --- presence
  const adaPresence = await tunggu(() => a.state.pesan.some((m) => m.type === 'presence'));
  cek('menerima kabar presence', adaPresence);

  // --- pesan private
  b.ws.send(JSON.stringify({ type: 'pm', to: A.id, text: 'Privat dari B' }));
  const aDapatPm = await tunggu(() => a.state.pesan.some((m) => m.type === 'pm' && m.text === 'Privat dari B'));
  cek('A menerima pesan private dari B', aDapatPm);

  // --- typing
  b.ws.send(JSON.stringify({ type: 'typing', to: A.id }));
  const aDapatTyping = await tunggu(() => a.state.pesan.some((m) => m.type === 'typing'));
  cek('A menerima indikator mengetik', aDapatTyping);

  // --- /api/users (harus online sekarang)
  const daftar = await api('GET', '/api/users', { token: A.token });
  const userA = daftar.data?.users?.find((u) => u.username === namaA);
  const userB = daftar.data?.users?.find((u) => u.username === namaB);
  cek('GET /api/users memuat kedua user', !!userA && !!userB);
  cek('status online terdeteksi', userA?.online === true && userB?.online === true, JSON.stringify([userA, userB]));

  // --- riwayat grup
  const riwayatGrup = await api('GET', '/api/messages', { token: A.token });
  cek('riwayat grup memuat pesan A',
    riwayatGrup.status === 200 && riwayatGrup.data.messages.some((m) => m.text === 'Halo grup dari A' && m.to === null));

  // --- riwayat private
  const riwayatPm = await api('GET', `/api/messages?with=${B.id}`, { token: A.token });
  cek('riwayat private memuat pesan B',
    riwayatPm.status === 200 && riwayatPm.data.messages.some((m) => m.text === 'Privat dari B' && m.to === A.id));

  // --- logout
  const keluar = await api('POST', '/api/logout', { token: A.token });
  cek('logout berhasil', keluar.status === 200 && keluar.data?.ok === true);

  a.ws.close();
  b.ws.close();
  ngawur.ws.close();
  await new Promise((r) => setTimeout(r, 400));

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal\n`);
  process.exit(gagal === 0 ? 0 : 1);
})().catch((err) => {
  console.error('GAGAL JALAN:', err.message);
  process.exit(1);
});
