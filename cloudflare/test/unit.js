// Uji unit server Cloudflare TANPA workerd (jalan di Node biasa).
//
// Menjalankan kode asli: src/index.js + src/chat_room.js,
// dengan tiruan (stub) untuk Durable Object: SQLite (node:sqlite) dan WebSocket.
//
//   node test/unit.js

import { DatabaseSync } from 'node:sqlite';
import worker, { ChatRoom } from '../src/index.js';

// ------------------------------------------------------------------ tiruan

class FakeSql {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  exec(query, ...params) {
    // Sama seperti Durable Object SQLite: kembalikan baris hasil.
    return this.db.prepare(query).all(...params);
  }
}

class FakeWs {
  constructor(nama) {
    this.nama = nama;
    this.sent = [];
    this.attachment = null;
    this.closed = null;
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close(code, reason) { this.closed = { code, reason }; }
  serializeAttachment(a) { this.attachment = structuredClone(a); }
  deserializeAttachment() { return this.attachment; }
  // pembantu uji
  ada(type) { return this.sent.some((m) => m.type === type); }
  cari(fn) { return this.sent.find(fn); }
}

const pasangan = []; // semua WebSocketPair yang dibuat
globalThis.WebSocketPair = function WebSocketPair() {
  const client = new FakeWs('client');
  const server = new FakeWs('server');
  pasangan.push([client, server]);
  return [client, server];
};

class FakeCtx {
  constructor() {
    this.storage = { sql: new FakeSql() };
    this.sockets = [];
    this.ready = null;
  }
  blockConcurrencyWhile(fn) { this.ready = Promise.resolve(fn()); }
  getWebSockets() { return [...this.sockets]; }
  acceptWebSocket(ws) { this.sockets.push(ws); }
}

// ------------------------------------------------------------------ uji

let lulus = 0;
let gagal = 0;
function cek(nama, ok, detail = '') {
  if (ok) { lulus++; console.log(`  ✔ ${nama}`); }
  else { gagal++; console.log(`  ✘ ${nama} ${detail}`); }
}

function req(path, { method = 'GET', body, token, headers = {} } = {}) {
  return new Request(`http://contoh${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function ambil(res) {
  return { status: res.status, data: await res.json() };
}

const ctx = new FakeCtx();
const room = new ChatRoom(ctx, {});
await ctx.ready; // tunggu migrasi database
ctx.acceptWebSocket = ctx.acceptWebSocket.bind(ctx);

// Worker (index.js) diarahkan ke ChatRoom di atas.
const env = {
  CHAT: {
    idFromName: () => 'main',
    get: () => ({ fetch: (request) => room.fetch(request) }),
  },
};

console.log('\nUji unit server Cloudflare (tanpa workerd)\n');

// --- halaman & kesehatan
const beranda = await worker.fetch(req('/'), env);
cek('GET / menampilkan halaman server', beranda.status === 200 && (await beranda.text()).includes('Server'));

const isiBeranda = await (await worker.fetch(req('/'), env)).text();
cek('halaman server memuat perintah siap salin (CMD + Termux)',
  isiBeranda.includes('curl.exe -O http://contoh/cli.js && node cli.js --server http://contoh') &&
  isiBeranda.includes('Invoke-WebRequest http://contoh/cli.js -OutFile cli.js') &&
  isiBeranda.includes('pkg install -y nodejs'),
  `panjang=${isiBeranda.length}`);
cek('halaman server menyarankan Node.js 22+ dan melarang "curl | node"',
  isiBeranda.includes('Node.js 22+') && isiBeranda.includes('curl ... | node'));

const isiGist = await (await worker.fetch(req('/'), { ...env, CLI_GIST: 'https://gist.githubusercontent.com/user/abc/raw/cli.js' })).text();
cek('tautan cadangan (gist) tampil di halaman bila diatur',
  isiGist.includes('curl -O https://gist.githubusercontent.com/user/abc/raw/cli.js && node cli.js --server http://contoh'));
cek('tautan cadangan disembunyikan bila tidak diatur',
  !isiBeranda.includes('tautan cadangan'));
cek('tautan cadangan tidak tampil bila alamatnya bukan https',
  !(await (await worker.fetch(req('/'), { ...env, CLI_GIST: 'javascript:alert(1)' })).text()).includes('tautan cadangan'));

const sehat = await ambil(await worker.fetch(req('/api/health'), env));
cek('GET /api/health ok', sehat.status === 200 && sehat.data.ok === true);

// --- header pengaman
cek('respons JSON punya header nosniff',
  (await worker.fetch(req('/api/health'), env)).headers.get('x-content-type-options') === 'nosniff');
cek('halaman HTML punya CSP + HSTS',
  beranda.headers.get('content-security-policy')?.includes("default-src 'none'") === true &&
  beranda.headers.get('strict-transport-security')?.includes('max-age=') === true,
  `csp=${beranda.headers.get('content-security-policy')}`);

const klien = await worker.fetch(req('/cli.js'), env);
const isiKlien = await klien.text();
cek('GET /cli.js bisa diunduh (berisi program klien)',
  klien.status === 200 && isiKlien.includes('Klien chat') && isiKlien.includes('--server'),
  `status=${klien.status} panjang=${isiKlien.length}`);

// --- registrasi & login
const A = await ambil(await worker.fetch(req('/api/register', { method: 'POST', body: { username: 'andi_uji', password: 'rahasia1' } }), env));
cek('registrasi user A (201)', A.status === 201 && A.data.token?.length === 64, JSON.stringify(A.data));

const B = await ambil(await worker.fetch(req('/api/register', { method: 'POST', body: { username: 'budi_uji', password: 'rahasia1' } }), env));
cek('registrasi user B (201)', B.status === 201 && B.data.token?.length === 64);

const dobel = await ambil(await worker.fetch(req('/api/register', { method: 'POST', body: { username: 'ANDI_UJI', password: 'rahasia1' } }), env));
cek('username dobel (beda huruf besar/kecil) ditolak 409', dobel.status === 409, JSON.stringify(dobel.data));

const buruk = await ambil(await worker.fetch(req('/api/register', { method: 'POST', body: { username: 'ab', password: '123' } }), env));
cek('username/password tidak valid ditolak 400', buruk.status === 400);

const salah = await ambil(await worker.fetch(req('/api/login', { method: 'POST', body: { username: 'andi_uji', password: 'salahsekali' } }), env));
cek('password salah ditolak 401', salah.status === 401);

const masuk = await ambil(await worker.fetch(req('/api/login', { method: 'POST', body: { username: 'andi_uji', password: 'rahasia1' } }), env));
cek('login benar berhasil', masuk.status === 200 && !!masuk.data.token);

const tanpa = await ambil(await worker.fetch(req('/api/users'), env));
cek('tanpa token ditolak 401', tanpa.status === 401);

const aku = await ambil(await worker.fetch(req('/api/me', { token: A.data.token }), env));
cek('GET /api/me mengembalikan user', aku.data.user?.username === 'andi_uji');

// --- token kedaluwarsa (>90 hari) tidak berlaku
const tokenTua = 'a'.repeat(64);
room.sql.exec(
  'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
  tokenTua, A.data.user.id, Date.now() - 100 * 24 * 60 * 60 * 1000,
);
const pakaiTua = await ambil(await worker.fetch(req('/api/me', { token: tokenTua }), env));
cek('token kedaluwarsa (>90 hari) ditolak 401', pakaiTua.status === 401);

// --- ganti kata sandi
const sandi1 = await ambil(await worker.fetch(req('/api/change-password', { method: 'POST', body: { oldPassword: 'rahasia1', newPassword: 'rahasia2' } }), env));
cek('ganti kata sandi tanpa login ditolak 401', sandi1.status === 401);

// perangkat kedua milik A — harus ikut keluar setelah sandi diganti
const masuk2 = await ambil(await worker.fetch(req('/api/login', { method: 'POST', body: { username: 'andi_uji', password: 'rahasia1' } }), env));
cek('perangkat kedua A berhasil masuk', masuk2.status === 200 && !!masuk2.data.token);

const sandiLama = await ambil(await worker.fetch(req('/api/change-password', { method: 'POST', token: A.data.token, body: { oldPassword: 'salahsandi', newPassword: 'rahasia2' } }), env));
cek('ganti kata sandi dengan sandi lama salah → 401', sandiLama.status === 401);

const sandiPendek = await ambil(await worker.fetch(req('/api/change-password', { method: 'POST', token: A.data.token, body: { oldPassword: 'rahasia1', newPassword: '123' } }), env));
cek('kata sandi baru terlalu pendek → 400', sandiPendek.status === 400);

const sandiOk = await ambil(await worker.fetch(req('/api/change-password', { method: 'POST', token: A.data.token, body: { oldPassword: 'rahasia1', newPassword: 'rahasia2' } }), env));
cek('ganti kata sandi berhasil', sandiOk.status === 200 && sandiOk.data.ok === true);

const perangkat2 = await ambil(await worker.fetch(req('/api/me', { token: masuk2.data.token }), env));
cek('perangkat lain otomatis keluar setelah sandi diganti', perangkat2.status === 401);

const iniMasih = await ambil(await worker.fetch(req('/api/me', { token: A.data.token }), env));
cek('perangkat yang mengganti sandi tetap masuk', iniMasih.status === 200);

const masukBaru = await ambil(await worker.fetch(req('/api/login', { method: 'POST', body: { username: 'andi_uji', password: 'rahasia2' } }), env));
cek('login dengan kata sandi baru berhasil', masukBaru.status === 200 && !!masukBaru.data.token);

const sandiLamaGagal = await ambil(await worker.fetch(req('/api/login', { method: 'POST', body: { username: 'andi_uji', password: 'rahasia1' } }), env));
cek('login dengan kata sandi lama ditolak 401', sandiLamaGagal.status === 401);

// --- WebSocket: masuk room
const wsA = new FakeWs('A');
const wsB = new FakeWs('B');
ctx.acceptWebSocket(wsA);
ctx.acceptWebSocket(wsB);
room.joinSocket(wsA, A.data.user);
room.joinSocket(wsB, B.data.user);

cek('A menerima hello + daftar user', wsA.ada('hello') && wsA.cari((m) => m.type === 'hello').users.length === 2);
cek('A diberi tahu B online', wsA.cari((m) => m.type === 'presence' && m.user.username === 'budi_uji' && m.status === 'online') !== undefined);

// --- pesan grup
await room.webSocketMessage(wsA, JSON.stringify({ type: 'group', text: 'Halo grup!' }));
cek('A & B menerima pesan grup', wsA.ada('group') && wsB.ada('group'));
cek('pesan grup tersimpan dengan id', wsA.cari((m) => m.type === 'group').id > 0);

// --- pesan private
await room.webSocketMessage(wsB, JSON.stringify({ type: 'pm', to: A.data.user.id, text: 'Hai, ini privat' }));
cek('A menerima private dari B', wsA.cari((m) => m.type === 'pm' && m.text === 'Hai, ini privat') !== undefined);
cek('B menerima pantulan private-nya sendiri', wsB.cari((m) => m.type === 'pm' && m.text === 'Hai, ini privat') !== undefined);

// --- private ke user yang tidak ada
await room.webSocketMessage(wsB, JSON.stringify({ type: 'pm', to: 99999, text: 'hantu' }));
cek('private ke user tak dikenal → pesan error', wsB.cari((m) => m.type === 'error') !== undefined);

// --- mengetik
await room.webSocketMessage(wsB, JSON.stringify({ type: 'typing', to: A.data.user.id }));
cek('A menerima indikator mengetik', wsA.ada('typing'));

// --- tipe tak dikenal
wsB.sent.length = 0;
await room.webSocketMessage(wsB, JSON.stringify({ type: 'ngawur' }));
cek('tipe pesan tak dikenal → error', wsB.ada('error'));

// --- pesan kosong diabaikan
wsA.sent.length = 0;
await room.webSocketMessage(wsA, JSON.stringify({ type: 'group', text: '   ' }));
cek('pesan grup kosong diabaikan', !wsA.ada('group'));

// --- pesan terlalu panjang ditolak dengan pesan jelas
wsA.sent.length = 0;
await room.webSocketMessage(wsA, JSON.stringify({ type: 'group', text: 'x'.repeat(2001) }));
cek('pesan >2000 karakter ditolak dengan pesan error',
  wsA.cari((m) => m.type === 'error' && m.error.includes('terlalu panjang')) !== undefined,
  JSON.stringify(wsA.sent));

// --- banjir pesan: maksimal 15 per 5 detik
wsA.sent.length = 0;
for (let i = 1; i <= 20; i++) {
  await room.webSocketMessage(wsA, JSON.stringify({ type: 'group', text: `banjir ${i}` }));
}
const terkirim = wsA.sent.filter((m) => m.type === 'group' && m.text.startsWith('banjir')).length;
cek('banjir pesan dibatasi (≤15 terkirim dari 20)',
  terkirim <= 15 && terkirim >= 1, `terkirim=${terkirim}`);
cek('pelaku banjir diberi tahu alasannya',
  wsA.cari((m) => m.type === 'error' && m.error.includes('Terlalu banyak')) !== undefined);

// --- /api/users
const daftar = await ambil(await worker.fetch(req('/api/users', { token: A.data.token }), env));
const uA = daftar.data.users.find((u) => u.username === 'andi_uji');
const uB = daftar.data.users.find((u) => u.username === 'budi_uji');
cek('/api/users memuat kedua user & online', uA?.online === true && uB?.online === true, JSON.stringify(daftar.data.users));

// --- riwayat
const rgrup = await ambil(await worker.fetch(req('/api/messages', { token: A.data.token }), env));
cek('riwayat grup memuat pesan grup', rgrup.data.messages.some((m) => m.text === 'Halo grup!' && m.to === null));

const rpribadi = await ambil(await worker.fetch(req(`/api/messages?with=${B.data.user.id}`, { token: A.data.token }), env));
cek('riwayat private memuat pesan privat', rpribadi.data.messages.some((m) => m.text === 'Hai, ini privat'));

const rterbalik = await ambil(await worker.fetch(req(`/api/messages?with=${A.data.user.id}`, { token: B.data.token }), env));
cek('riwayat private terlihat dari sisi B', rterbalik.data.messages.some((m) => m.text === 'Hai, ini privat'));

const rbatas = await ambil(await worker.fetch(req('/api/messages?limit=1', { token: A.data.token }), env));
cek('parameter limit dihormati', rbatas.data.messages.length === 1);

// --- keluar (socket)
await room.webSocketClose(wsB);
cek('A diberi tahu B offline', wsA.cari((m) => m.type === 'presence' && m.status === 'offline') !== undefined);

// --- pesan tertinggal: dikirim selagi penerima offline, sampai saat dia online
// (Cloudflare otomatis membuang socket yang sudah tutup; di tiruan ini kita
// buang sendiri supaya perilakunya sama.)
ctx.sockets = ctx.sockets.filter((s) => s !== wsB);

async function putuskan(ws) {
  await room.webSocketClose(ws);
  ctx.sockets = ctx.sockets.filter((s) => s !== ws);
}

// Bersihkan dulu batas banjir milik A (dari uji banjir di atas) supaya
// pengiriman di bawah ini tidak ikut ditolak.
room.kirim.hapus(A.data.user.id);

await room.webSocketMessage(wsA, JSON.stringify({ type: 'pm', to: B.data.user.id, text: 'untuk B saat offline' }));
await room.webSocketMessage(wsA, JSON.stringify({ type: 'group', text: 'grup saat B offline' }));

const wsB2 = new FakeWs('B2');
ctx.acceptWebSocket(wsB2);
room.joinSocket(wsB2, B.data.user);
cek('B menerima PM yang dikirim saat dia offline',
  wsB2.cari((m) => m.type === 'pm' && m.text === 'untuk B saat offline') !== undefined,
  JSON.stringify(wsB2.sent.map((m) => m.type)));
cek('B menerima pesan grup yang dikirim saat dia offline',
  wsB2.cari((m) => m.type === 'group' && m.text === 'grup saat B offline') !== undefined);

await putuskan(wsB2);
await room.webSocketMessage(wsA, JSON.stringify({ type: 'pm', to: B.data.user.id, text: 'pesan kedua saat offline' }));

const wsB3 = new FakeWs('B3');
ctx.acceptWebSocket(wsB3);
room.joinSocket(wsB3, B.data.user);
cek('sambung ulang menerima pesan baru',
  wsB3.cari((m) => m.type === 'pm' && m.text === 'pesan kedua saat offline') !== undefined,
  JSON.stringify(wsB3.sent.map((m) => m.type)));
cek('pesan lama tidak dikirim dua kali',
  wsB3.cari((m) => m.type === 'pm' && m.text === 'untuk B saat offline') === undefined,
  JSON.stringify(wsB3.sent.map((m) => m.text)));

await putuskan(wsB3);

// --- handleUpgrade: token ngawur ditutup 4001, token benar dapat hello
try { room.handleUpgrade(new URL('http://contoh/ws?token=' + '0'.repeat(64))); } catch { /* Response 101 tidak dikenal Node */ }
const pasanganTerakhir = pasangan[pasangan.length - 1];
cek('token tidak valid → socket ditutup 4001', pasanganTerakhir[1].closed?.code === 4001);

try { room.handleUpgrade(new URL(`http://contoh/ws?token=${A.data.token}`)); } catch { /* Response 101 */ }
cek('token benar → langsung menerima hello', pasangan[pasangan.length - 1][1].ada('hello'));

// --- logout
const keluar = await ambil(await worker.fetch(req('/api/logout', { method: 'POST', token: A.data.token }), env));
cek('logout berhasil', keluar.status === 200 && keluar.data.ok === true);

const setelahKeluar = await ambil(await worker.fetch(req('/api/me', { token: A.data.token }), env));
cek('token lama tidak berlaku setelah logout', setelahKeluar.status === 401);

// --- endpoint tidak dikenal
const takAda = await ambil(await worker.fetch(req('/api/entah'), env));
cek('endpoint tak dikenal → 404', takAda.status === 404);

// --- batas pendaftaran (10 per jam per IP) — diuji terakhir karena mengunci IP
const masihBoleh = await ambil(await worker.fetch(req('/api/register', { method: 'POST', body: { username: 'tambah_awal', password: 'rahasia1' } }), env));
cek('pendaftaran ke-5 masih diterima (201)', masihBoleh.status === 201, JSON.stringify(masihBoleh.data));

let statusDaftar = 0;
for (let i = 0; i < 6; i++) {
  const r = await worker.fetch(req('/api/register', { method: 'POST', body: { username: `tambah_${i}`, password: 'rahasia1' } }), env);
  statusDaftar = r.status;
}
cek('pendaftaran setelah batas diblokir 429', statusDaftar === 429, `status akhir=${statusDaftar}`);

// --- penangkal brute-force login (10 gagal → 429) — juga diuji terakhir
let kodeTerakhir = 0;
for (let i = 0; i < 12; i++) {
  const r = await worker.fetch(req('/api/login', { method: 'POST', body: { username: 'andi_uji', password: `ngawur${i}` } }), env);
  kodeTerakhir = r.status;
}
cek('percobaan login berulang diblokir 429', kodeTerakhir === 429, `status akhir=${kodeTerakhir}`);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal === 0 ? 0 : 1);
