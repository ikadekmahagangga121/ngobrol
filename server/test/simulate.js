'use strict';

// Simulasi 2 user ngobrol lewat server lokal — untuk uji cepat tanpa HP.
// Jalankan:  npm test   (server harus sudah jalan di port 8080)

const WebSocket = require('ws');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';

async function api(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${data.error}`);
  return data;
}

function connect(token, name) {
  const ws = new WebSocket(`ws://127.0.0.1:8080/ws?token=${token}`);
  ws.on('open', () => console.log(`[${name}] tersambung`));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'hello') return console.log(`[${name}] hello, user lain: ${m.users.map((u) => u.username).join(', ')}`);
    if (m.type === 'group') return console.log(`[${name}] GRUP  <${m.from.username}> ${m.text}`);
    if (m.type === 'pm') return console.log(`[${name}] PRIV  <${m.from.username}> ${m.text}`);
    if (m.type === 'presence') return console.log(`[${name}] * ${m.user.username} ${m.status}`);
  });
  ws.on('close', (code) => console.log(`[${name}] terputus (${code})`));
  return ws;
}

async function main() {
  const rand = Math.floor(Math.random() * 100000);
  const a = await api('/api/register', { username: `andi_${rand}`, password: 'rahasia1' });
  const b = await api('/api/register', { username: `budi_${rand}`, password: 'rahasia1' });
  console.log(`registrasi ok: ${a.user.username} & ${b.user.username}`);

  const wsA = connect(a.token, a.user.username);
  const wsB = connect(b.token, b.user.username);

  await new Promise((r) => setTimeout(r, 800));
  wsA.send(JSON.stringify({ type: 'group', text: 'Halo semua, ini pesan grup!' }));
  await new Promise((r) => setTimeout(r, 400));
  wsB.send(JSON.stringify({ type: 'pm', to: a.user.id, text: 'Halo, ini pesan private ya' }));
  await new Promise((r) => setTimeout(r, 400));
  wsA.send(JSON.stringify({ type: 'pm', to: b.user.id, text: 'Balasan private dari A' }));

  await new Promise((r) => setTimeout(r, 800));
  wsA.close(); wsB.close();
  console.log('selesai ✓');
  process.exit(0);
}

main().catch((err) => { console.error('GAGAL:', err.message); process.exit(1); });
