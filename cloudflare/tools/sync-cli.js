// Menyalin klien terminal (server/cli.js) ke tempat yang membutuhkannya:
//
//   1. client-pc/cli.js              → untuk disalin ke PC/laptop lain
//   2. cloudflare/src/cli_source.js  → disematkan di Worker, supaya bisa
//                                      diunduh dari internet lewat /cli.js
//
// Dijalankan otomatis sebelum `npm run deploy` / `npm test`.
// Sumber kebenarannya tetap SATU: server/cli.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chatApp = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sumber = path.join(chatApp, 'server', 'cli.js');
const isi = fs.readFileSync(sumber, 'utf8');

// 1. Salinan untuk dibawa ke PC lain
const keClientPc = path.join(chatApp, 'client-pc', 'cli.js');
fs.mkdirSync(path.dirname(keClientPc), { recursive: true });
fs.writeFileSync(keClientPc, isi);

// 2. Modul yang disematkan di Worker (dipakai endpoint /cli.js)
const keWorker = path.join(chatApp, 'cloudflare', 'src', 'cli_source.js');
fs.writeFileSync(
  keWorker,
  '// Dibuat otomatis oleh tools/sync-cli.js — JANGAN diedit manual.\n' +
  '// Isinya salinan dari server/cli.js\n' +
  `export default ${JSON.stringify(isi)};\n`,
);

const ukuran = (isi.length / 1024).toFixed(1);
console.log(`cli.js (${ukuran} KB) disalin ke:`);
console.log('  - client-pc/cli.js');
console.log('  - cloudflare/src/cli_source.js');
