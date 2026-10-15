// Uji klien terminal: 2 klien saling kirim pesan grup & private.
// Jalankan: node test/driver.js   (server harus hidup di 127.0.0.1:8080)
const { spawn } = require('node:child_process');

function jalankanKlien(nama) {
  const p = spawn('node', ['cli.js', '--server', process.env.SERVER || 'http://127.0.0.1:8080', '--name', nama, '--pass', 'rahasia1'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = { out: '', siap: false };
  const tulis = (s) => p.stdin.write(s + '\n');
  p.stdout.on('data', (d) => {
    state.out += d.toString();
    if (!state.daftarDijawab && state.out.includes('Daftar akun baru?')) {
      state.daftarDijawab = true;
      setTimeout(() => tulis('y'), 100);
    }
    if (!state.siap && state.out.includes('Terhubung ke server')) state.siap = true;
  });
  p.stderr.on('data', (d) => { state.out += d.toString(); });
  return { p, state, tulis };
}

const A = jalankanKlien('ujiA');
const B = jalankanKlien('ujiB');

async function tunggu(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

(async () => {
  const siap = await tunggu(() => A.state.siap && B.state.siap, 15000);
  console.log('kedua klien tersambung:', siap ? 'YA' : 'TIDAK');

  A.tulis('Halo grup dari A');
  await new Promise((r) => setTimeout(r, 800));
  B.tulis('/w ujiA hai A, ini privat dari B');
  await new Promise((r) => setTimeout(r, 1200));

  const bDapatGrup = B.state.out.includes('Halo grup dari A');
  const aDapatPm = A.state.out.includes('[PM ujiB]') && A.state.out.includes('privat dari B');
  console.log('B menerima pesan GRUP dari A :', bDapatGrup ? 'LULUS' : 'GAGAL');
  console.log('A menerima PRIVATE dari B   :', aDapatPm ? 'LULUS' : 'GAGAL');

  A.tulis('/quit');
  B.tulis('/quit');
  await new Promise((r) => setTimeout(r, 500));
  A.p.kill(); B.p.kill();
  process.exit(bDapatGrup && aDapatPm ? 0 : 1);
})();
