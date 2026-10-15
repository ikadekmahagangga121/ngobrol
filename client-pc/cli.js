'use strict';

// 💬 Klien chat berbasis terminal (CMD / PowerShell / Termux / Linux / macOS).
//
//   node cli.js
//   node cli.js --server http://192.168.1.4:8080 --name budi --pass rahasia1
//
// Tanpa dependency apa pun: memakai WebSocket bawaan Node.js (versi 22+).
// Untuk Node lama, otomatis memakai paket "ws" bila tersedia.

const readline = require('node:readline');

const args = process.argv.slice(2);
function argValue(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const SERVER = argValue('--server', 'http://127.0.0.1:8080').replace(/\/+$/, '');
const NAMA = argValue('--name', null);
const PASS = argValue('--pass', null);

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  hijau: '\x1b[32m', kuning: '\x1b[33m',
  cyan: '\x1b[36m', merah: '\x1b[31m',
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let me = null;
let TOKEN = null; // token login, dipakai untuk /sandi (ganti kata sandi)
let usersByName = new Map(); // lowercase -> {id, username}
let usersById = new Map();

function printLine(text) {
  process.stdout.write('\r\x1b[K' + text + '\n');
  rl.setPrompt('> ');
  rl.prompt(true);
}

function tgl(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function api(path, body, token) {
  const res = await fetch(SERVER + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function tanya(pertanyaan) {
  return new Promise((resolve) => rl.question(pertanyaan, resolve));
}

/** Bikin koneksi WebSocket yang jalan di Node modern (bawaan) maupun Node lama (paket ws). */
function buatSocket(url) {
  if (typeof globalThis.WebSocket === 'function') {
    const ws = new globalThis.WebSocket(url);
    return {
      send: (s) => ws.send(s),
      onOpen: (fn) => ws.addEventListener('open', fn),
      onMessage: (fn) => ws.addEventListener('message', (e) => fn(typeof e.data === 'string' ? e.data : String(e.data))),
      onClose: (fn) => ws.addEventListener('close', (e) => fn(e.code || 1006)),
      onError: () => {},
    };
  }
  let WS;
  try {
    WS = require('ws'); // cadangan untuk Node < 22
  } catch {
    console.error('\nNode.js Anda terlalu lama. Pasang Node.js 22 atau lebih baru (gratis) dari https://nodejs.org, lalu jalankan lagi.\n');
    process.exit(1);
  }
  const ws = new WS(url);
  return {
    send: (s) => ws.send(s),
    onOpen: (fn) => ws.on('open', fn),
    onMessage: (fn) => ws.on('message', (d) => fn(d.toString())),
    onClose: (fn) => ws.on('close', (code) => fn(code)),
    onError: (fn) => ws.on('error', fn),
  };
}

async function auth() {
  const username = NAMA || (await tanya('Nama pengguna: ')).trim();
  const password = PASS || (await tanya('Kata sandi: '));
  try {
    return await api('/api/login', { username, password });
  } catch (e) {
    if (String(e.message).toLowerCase().includes('salah')) {
      const daftar = (await tanya(`Login gagal (${e.message}). Daftar akun baru? [y/N] `)).toLowerCase();
      if (daftar === 'y') {
        return api('/api/register', { username, password });
      }
    }
    throw e;
  }
}

/** /sandi — ganti kata sandi. Perangkat lain otomatis keluar. */
async function gantiSandi() {
  if (!TOKEN) return printLine(`${C.merah}Belum tersambung ke server.${C.reset}`);
  const lama = await tanya('Kata sandi lama: ');
  const baru = await tanya('Kata sandi baru (minimal 6 karakter): ');
  const ulang = await tanya('Ulangi kata sandi baru: ');
  if (baru !== ulang) return printLine(`${C.merah}✗ Kata sandi baru tidak sama.${C.reset}`);
  try {
    await api('/api/change-password', { oldPassword: lama, newPassword: baru }, TOKEN);
    printLine(`${C.hijau}✔ Kata sandi diganti. Perangkat lain yang masih masuk sudah otomatis keluar.${C.reset}`);
  } catch (e) {
    printLine(`${C.merah}✗ ${e.message}${C.reset}`);
  }
}

function renderUserList() {
  const lain = [...usersById.values()].filter((u) => u.id !== me.id);
  return lain.map((u) => {
    const dot = u.online ? `${C.hijau}●${C.reset}` : `${C.dim}○${C.reset}`;
    return `  ${dot} ${u.username}`;
  }).join('\n') || '  (belum ada user lain)';
}

let ws;
function handleInput(line) {
  const text = line.trim();
  if (!text) return rl.prompt(true);

  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(' ');
    switch (cmd.toLowerCase()) {
      case '/help':
        printLine(`${C.dim}Perintah:${C.reset}
  /w <user> <pesan>   kirim pesan private
  /users              daftar pengguna
  /sandi              ganti kata sandi akunmu
  /help               bantuan
  /quit               keluar
  teks biasa          kirim ke room grup`);
        return;
      case '/users':
        printLine(`${C.bold}Pengguna:${C.reset}\n${renderUserList()}`);
        return;
      case '/sandi':
        gantiSandi();
        return;
      case '/w': {
        const target = rest.shift();
        const pesan = rest.join(' ');
        if (!target || !pesan) return printLine(`${C.merah}Pakai: /w <username> <pesan>${C.reset}`);
        const u = usersByName.get(target.toLowerCase());
        if (!u) return printLine(`${C.merah}User "${target}" tidak ditemukan. /users untuk lihat daftar.${C.reset}`);
        ws.send(JSON.stringify({ type: 'pm', to: u.id, text: pesan }));
        return;
      }
      case '/quit':
      case '/exit':
        console.log('Sampai jumpa!');
        process.exit(0);
      default:
        printLine(`${C.merah}Perintah tidak dikenal. /help${C.reset}`);
        return;
    }
  }

  ws.send(JSON.stringify({ type: 'group', text }));
}

function connect(token) {
  const wsUrl = `${SERVER.replace(/^http/, 'ws')}/ws?token=${token}`;
  ws = buatSocket(wsUrl);

  ws.onOpen(() => printLine(`${C.hijau}✔ Terhubung ke server. Ketik /help untuk bantuan.${C.reset}`));

  ws.onMessage((raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    switch (m.type) {
      case 'hello':
        me = m.user;
        usersById = new Map(m.users.map((u) => [u.id, u]));
        usersByName = new Map(m.users.map((u) => [u.username.toLowerCase(), u]));
        break;
      case 'group':
        if (m.from.id === me.id) break; // pesan sendiri tidak perlu ditampilkan lagi
        printLine(`${C.dim}${tgl(m.at)}${C.reset} ${C.cyan}${C.bold}${m.from.username}${C.reset}: ${m.text}`);
        break;
      case 'pm': {
        const dariSendiri = m.from.id === me.id;
        const nama = dariSendiri ? `→${usersById.get(m.to)?.username ?? '?'}` : m.from.username;
        printLine(`${C.dim}${tgl(m.at)}${C.reset} ${C.hijau}${C.bold}[PM ${nama}]${C.reset} ${m.text}`);
        break;
      }
      case 'presence':
        printLine(`${C.dim}* ${m.user.username} ${m.status === 'online' ? 'online' : 'offline'}${C.reset}`);
        break;
      case 'error':
        printLine(`${C.merah}✗ ${m.error}${C.reset}`);
        break;
    }
  });

  ws.onClose((code) => {
    if (code === 4001) {
      printLine(`${C.merah}Token tidak valid — jalankan ulang program.${C.reset}`);
      process.exit(1);
    }
    printLine(`${C.kuning}⚠ Terputus, mencoba sambung ulang...${C.reset}`);
    setTimeout(() => connect(token), 2000);
  });

  ws.onError(() => {});
}

async function main() {
  console.log(`${C.bold}💬 Ngobrol — klien terminal${C.reset} ${C.dim}(${SERVER})${C.reset}`);
  try {
    const d = await auth();
    me = d.user;
    TOKEN = d.token;
    connect(d.token);
  } catch (e) {
    console.error(`${C.merah}Gagal: ${e.message}${C.reset}`);
    process.exit(1);
  }

  rl.setPrompt('> ');
  rl.prompt();
  rl.on('line', (line) => {
    try { handleInput(line); } catch (err) { printLine(`${C.merah}${err.message}${C.reset}`); }
  });
  rl.on('close', () => { console.log('\nSampai jumpa!'); process.exit(0); });
}

main();
