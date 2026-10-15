'use strict';

// Uji "pesan tertinggal": pesan yang dikirim saat penerima offline harus
// sampai begitu penerima kembali online — dan tidak terkirim dua kali.
//
//   node test/offline.js
//
// Server uji dijalankan sendiri di port 8096 dengan database sementara.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const WebSocket = require('ws');

const PORT = Number(process.env.UJI_PORT) || 8096;
const BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngobrol-offline-'));
const fileDb = path.join(dir, 'uji.db');

let lulus = 0;
let gagal = 0;
function cek(nama, ok, detail = '') {
  if (ok) { lulus++; console.log(`  ✔ ${nama}`); }
  else { gagal++; console.log(`  ✘ ${nama} ${detail}`); }
}

const anak = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), DB_FILE: fileDb, BCRYPT_COST: '4' },
  stdio: ['ignore', 'ignore', 'inherit'],
});

async function api(path, body, token, method = 'POST') {
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

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tunggu sampai server benar-benar menganggap user ini offline (socket ditutup). */
async function tungguOffline(token, userId) {
  for (let i = 0; i < 50; i++) {
    const r = await api('/api/users', null, token, 'GET');
    const u = (r.data?.users ?? []).find((x) => x.id === userId);
    if (u && u.online === false) return true;
    await tunggu(100);
  }
  return false;
}

/** Buka socket, tunggu hello, lalu kumpulkan pesan yang masuk. */
async function sambung(token) {
  const ws = new WebSocket(`${WS_URL}?token=${token}`);
  const masuk = [];
  ws.on('message', (raw) => { try { masuk.push(JSON.parse(raw)); } catch { /* abaikan */ } });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  // beri waktu hello + pesan tertinggal datang
  for (let i = 0; i < 30 && !masuk.some((m) => m.type === 'hello'); i++) await tunggu(50);
  await tunggu(400);
  return { ws, masuk };
}

function tutup(klien) {
  return new Promise((res) => {
    klien.ws.on('close', res);
    klien.ws.close();
    setTimeout(res, 800); // jangan menggantung kalau 'close' tak datang
  });
}

function teksPm(masuk) {
  return masuk.filter((m) => m.type === 'pm').map((m) => m.text);
}
function teksGrup(masuk) {
  return masuk.filter((m) => m.type === 'group').map((m) => m.text);
}

(async () => {
  console.log('\nUji pesan tertinggal (penerima offline)\n');

  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* belum siap */ }
    await tunggu(150);
  }

  const a = await api('/api/register', { username: 'kirim_a', password: 'rahasia1' });
  const b = await api('/api/register', { username: 'terima_b', password: 'rahasia1' });
  cek('dua akun uji siap', a.status === 201 && b.status === 201);

  const idA = a.data.user.id;
  const idB = b.data.user.id;

  // --- A online, B BELUM pernah online
  const ka = await sambung(a.data.token);
  cek('A tersambung', ka.masuk.some((m) => m.type === 'hello'));
  cek('A tidak dibanjiri pesan lama', teksGrup(ka.masuk).length === 0 && teksPm(ka.masuk).length === 0,
    JSON.stringify(ka.masuk.map((m) => m.type)));

  // A kirim 2 PM + 1 grup selagi B offline
  ka.ws.send(JSON.stringify({ type: 'pm', to: idB, text: 'halo B, nomor 1' }));
  ka.ws.send(JSON.stringify({ type: 'pm', to: idB, text: 'halo B, nomor 2' }));
  ka.ws.send(JSON.stringify({ type: 'group', text: 'pengumuman untuk semua' }));
  await tunggu(700);

  cek('pesan tersimpan walau B offline (tidak error)',
    !ka.masuk.some((m) => m.type === 'error'), JSON.stringify(ka.masuk.filter((m) => m.type === 'error')));

  // --- B online: harus menerima ketiganya
  const kb = await sambung(b.data.token);
  cek('B menerima PM yang dikirim saat dia offline',
    teksPm(kb.masuk).includes('halo B, nomor 1') && teksPm(kb.masuk).includes('halo B, nomor 2'),
    JSON.stringify(teksPm(kb.masuk)));
  cek('B menerima pesan grup yang dikirim saat dia offline',
    teksGrup(kb.masuk).includes('pengumuman untuk semua'), JSON.stringify(teksGrup(kb.masuk)));
  cek('urutan pesan benar (nomor 1 sebelum nomor 2)',
    teksPm(kb.masuk).indexOf('halo B, nomor 1') < teksPm(kb.masuk).indexOf('halo B, nomor 2'));

  // B balas selagi online
  kb.ws.send(JSON.stringify({ type: 'pm', to: idA, text: 'iya, aku baru online' }));
  await tunggu(500);
  cek('balasan B sampai ke A secara langsung',
    teksPm(ka.masuk).includes('iya, aku baru online'));

  // --- B offline lagi, A kirim lagi, B online lagi
  await tutup(kb);
  cek('server menandai B offline', await tungguOffline(a.data.token, idB));

  ka.ws.send(JSON.stringify({ type: 'pm', to: idB, text: 'pesan ketiga' }));
  await tunggu(600);

  const kb2 = await sambung(b.data.token);
  cek('B menerima pesan baru setelah sambung ulang', teksPm(kb2.masuk).includes('pesan ketiga'),
    JSON.stringify(teksPm(kb2.masuk)));
  cek('pesan lama TIDAK dikirim ulang (tidak dobel)',
    !teksPm(kb2.masuk).includes('halo B, nomor 1') && !teksPm(kb2.masuk).includes('halo B, nomor 2'),
    JSON.stringify(teksPm(kb2.masuk)));

  // --- A juga tidak menerima ulang pesannya sendiri
  await tutup(ka);
  cek('server menandai A offline', await tungguOffline(b.data.token, idA));
  const ka2 = await sambung(a.data.token);
  cek('A tidak menerima ulang PM lamanya sendiri',
    !teksPm(ka2.masuk).includes('halo B, nomor 1'), JSON.stringify(teksPm(ka2.masuk)));

  // --- riwayat tetap lengkap (pesan tidak hilang dari database)
  const riwayat = await api(`/api/messages?with=${idB}`, null, a.data.token, 'GET');
  const semua = (riwayat.data?.messages ?? []).map((m) => m.text);
  cek('riwayat PM lengkap di database',
    semua.includes('halo B, nomor 1') && semua.includes('halo B, nomor 2') && semua.includes('pesan ketiga'),
    JSON.stringify(semua));

  const rgrup = await api('/api/messages', null, a.data.token, 'GET');
  cek('riwayat grup lengkap di database',
    (rgrup.data?.messages ?? []).some((m) => m.text === 'pengumuman untuk semua'));

  await tutup(kb2);
  await tutup(ka2);

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal\n`);
  try { anak.kill(); } catch { /* sudah mati */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* masih dipakai */ }
  process.exit(gagal === 0 ? 0 : 1);
})().catch((err) => {
  console.error('GAGAL:', err);
  try { anak.kill(); } catch { /* sudah mati */ }
  process.exit(1);
});
