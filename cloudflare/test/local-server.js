// Menjalankan worker Ngobrol + Durable Object di komputer (Miniflare),
// supaya bisa diuji tanpa `wrangler dev` dan tanpa login Cloudflare.
//
//   node test/local-server.js
//   → server hidup di http://127.0.0.1:8787
//   → di jendela lain:  node test/simulate.js

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8787;

// Miniflare versi 5 memakai bentuk opsi baru; opsi gaya lama dikonversi.
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: path.join(root, 'src', 'index.js'),
  compatibilityDate: '2026-01-01',
  host: '127.0.0.1',
  port,
  durableObjects: {
    CHAT: { className: 'ChatRoom', useSQLite: true },
  },
}));

await mf.ready;
console.log(`Miniflare siap di http://127.0.0.1:${port}`);
console.log('Jalankan di jendela lain:  node test/simulate.js');

// Jaga proses tetap hidup.
setInterval(() => {}, 1 << 30);
