'use strict';
// Uji cepat alat push-gist.js memakai server tiruan (tidak menyentuh GitHub).
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ID = 'a1b2c3d4e5f6';
let dibuat = 0;
let diperbarui = 0;

function jalankan(port) {
  return new Promise((selesai) => {
    const anak = spawn(process.execPath, [path.join(__dirname, 'push-gist.js')], {
      env: { ...process.env, GITHUB_TOKEN: 'token_uji', GIST_API: `http://127.0.0.1:${port}` },
    });
    let keluaran = '';
    let galat = '';
    anak.stdout.on('data', (c) => { keluaran += c; });
    anak.stderr.on('data', (c) => { galat += c; });
    anak.on('close', (kode) => selesai({ status: kode, stdout: keluaran, stderr: galat }));
  });
}

const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const kirim = (kode, data) => {
      res.writeHead(kode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'POST') {
      dibuat++;
      const j = JSON.parse(body);
      if (!j.files || !j.files['cli.js']) return kirim(422, { message: 'tanpa berkas' });
      return kirim(201, {
        id: ID,
        html_url: `https://gist.github.com/tester/${ID}`,
        public: !!j.public,
        owner: { login: 'tester' },
      });
    }
    if (req.method === 'PATCH') {
      if (!req.url.endsWith(ID)) return kirim(404, { message: 'tidak ada' });
      diperbarui++;
      return kirim(200, {
        id: ID,
        html_url: `https://gist.github.com/tester/${ID}`,
        public: false,
        owner: { login: 'tester' },
      });
    }
    kirim(405, { message: 'metode tidak didukung' });
  });
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const idFile = path.join(__dirname, 'gist-id.txt');
  const adaIdLama = fs.existsSync(idFile);
  const simpanIdLama = adaIdLama ? fs.readFileSync(idFile, 'utf8') : null;

  try { fs.rmSync(idFile); } catch { /* belum ada */ }

  const pertama = await jalankan(port);
  const idTersimpan = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : '(tidak ada)';
  const kedua = await jalankan(port);

  const benar = (nama, ok, detail = '') =>
    console.log(`  ${ok ? '✔' : '✘'} ${nama}${ok ? '' : ` ${detail}`}`);

  console.log('\nUji alat GitHub Gist (server tiruan)\n');
  benar('pembuatan gist berhasil', pertama.status === 0, pertama.stderr);
  benar('ID gist disimpan', idTersimpan === ID, idTersimpan);
  benar('menampilkan link unduh versi terbaru',
    pertama.stdout.includes(`https://gist.githubusercontent.com/tester/${ID}/raw/cli.js`));
  benar('memperingatkan agar tidak pakai "curl | node"', pertama.stdout.includes('jangan pakai'));
  benar('jalankan kedua memperbarui gist yang sama', kedua.status === 0 && diperbarui === 1,
    `diperbarui=${diperbarui}`);
  benar('link tetap sama saat diperbarui',
    kedua.stdout.includes(`https://gist.githubusercontent.com/tester/${ID}/raw/cli.js`));
  benar('hanya satu gist dibuat', dibuat === 1, `dibuat=${dibuat}`);

  // Skenario: gist lama sudah dihapus → alat harus membuat gist baru.
  fs.writeFileSync(idFile, 'id_lama_yang_sudah_hilang\n');
  const ketiga = await jalankan(port);
  benar('gist lama hilang → otomatis dibuat baru',
    ketiga.status === 0 && dibuat === 2 && ketiga.stdout.includes('Gist lama tidak ada'),
    `dibuat=${dibuat}`);
  benar('ID gist baru menggantikan yang lama',
    fs.readFileSync(idFile, 'utf8').trim() === ID);

  if (adaIdLama) fs.writeFileSync(idFile, simpanIdLama);
  else { try { fs.rmSync(idFile); } catch { /* sudah bersih */ } }

  srv.close();
  console.log('');
});
