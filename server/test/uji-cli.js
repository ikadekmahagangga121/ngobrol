'use strict';
// Uji klien terminal: login, kirim pesan grup, ganti sandi lewat /sandi.
//   node test/uji-cli.js
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 8097;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngobrol-cli-'));
const file = path.join(dir, 'uji.db');

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), DB_FILE: file, BCRYPT_COST: '4' },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
    await tunggu(150);
  }

  // akun untuk uji
  await fetch(`${BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'cliuser', password: 'rahasia1' }),
  });

  const cli = spawn(process.execPath, [path.join(__dirname, '..', 'cli.js'), '--server', BASE], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  cli.stdout.on('data', (d) => { out += d.toString(); });
  cli.stderr.on('data', (d) => { out += d.toString(); });

  // Tunggu sampai teks tertentu muncul — agar tidak balapan dengan CLI saat start.
  async function tungguSampai(teks, batas = 20000) {
    const mulai = Date.now();
    while (Date.now() - mulai < batas) {
      if (out.includes(teks)) return true;
      await tunggu(100);
    }
    return false;
  }

  await tungguSampai('Nama pengguna:');
  cli.stdin.write('cliuser\n');   // nama pengguna
  await tungguSampai('Kata sandi:');
  cli.stdin.write('rahasia1\n');  // kata sandi
  await tungguSampai('Terhubung ke server');
  cli.stdin.write('/sandi\n');    // mulai ganti sandi
  await tungguSampai('Kata sandi lama:');
  cli.stdin.write('rahasia1\n');  // sandi lama
  await tungguSampai('Kata sandi baru');
  cli.stdin.write('rahasia2\n');  // sandi baru
  await tungguSampai('Ulangi kata sandi baru');
  cli.stdin.write('rahasia2\n');  // ulangi
  await tungguSampai('Kata sandi diganti');
  cli.stdin.write('pesan setelah ganti sandi\n');
  await tunggu(800);
  cli.stdin.write('/quit\n');
  await tunggu(800);

  cli.kill();
  await tunggu(400);

  const bersih = [
    ['terhubung ke server', out.includes('Terhubung ke server')],
    ['perintah /sandi sukses', out.includes('Kata sandi diganti')],
    ['masih bisa kirim pesan setelah ganti sandi', out.includes('Terhubung')],
    ['tidak ada error tak terduga', !out.includes('tidak sama') && !out.includes('Gagal:')],
  ];

  console.log('\nUji klien terminal (/sandi)\n');
  let gagal = 0;
  for (const [nama, ok] of bersih) {
    console.log(`  ${ok ? '✔' : '✘'} ${nama}`);
    if (!ok) gagal++;
  }

  // pastikan sandi benar-benar berubah
  const loginBaru = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'cliuser', password: 'rahasia2' }),
  });
  const ok2 = loginBaru.status === 200;
  console.log(`  ${ok2 ? '✔' : '✘'} sandi baru berlaku di server`);
  if (!ok2) gagal++;

  srv.kill();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  console.log('');
  process.exit(gagal === 0 ? 0 : 1);
})().catch((e) => { console.error(e); try { srv.kill(); } catch {} process.exit(1); });
