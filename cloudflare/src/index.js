// Worker entry — pintu masuk semua permintaan.
//
//   /api/health  → jawab langsung (tanpa membangunkan database)
//   /cli.js      → unduh klien terminal (CMD / Termux) — tanpa install apa pun
//   /            → halaman kecil untuk cek server + perintah siap pakai
//   /api/* & /ws → diteruskan ke Durable Object "ChatRoom" (instance "main")

import { json, preflight, AMAN } from './util.js';
import CLI_SOURCE from './cli_source.js';

export { ChatRoom } from './chat_room.js';

// Halaman ini hanya boleh memuat gayanya sendiri — tidak ada script, gambar,
// atau koneksi keluar. CSP ketat + header pengaman mencegah penyalahgunaan.
const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function halaman(origin, tautanGist) {
  const asal = origin.replace(/\/+$/, '');
  const cadangan = tautanGist
    ? `
    <h2>Kalau unduhan dari server tidak jalan</h2>
    <p>Isinya sama, dari tautan cadangan ini:</p>
    <pre>curl -O ${tautanGist} && node cli.js --server ${asal}</pre>`
    : '';
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ngobrol — Server</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #101418; color: #e8eef5;
           display: flex; align-items: center; justify-content: center; min-height: 100vh;
           margin: 0; padding: 20px; box-sizing: border-box; }
    .kartu { background: #18202a; padding: 26px 30px; border-radius: 16px; width: 100%; max-width: 560px;
             box-shadow: 0 10px 30px rgba(0,0,0,.45); }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .nyala { color: #4ade80; font-weight: 600; margin: 4px 0 18px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #7b8b9c; margin: 20px 0 8px; }
    code { background: #0d1117; padding: 2px 6px; border-radius: 6px; color: #7dd3fc; font-size: 13px; }
    pre { background: #0d1117; padding: 12px 14px; border-radius: 10px; overflow-x: auto;
          margin: 0; color: #a5e8b5; font-size: 13px; line-height: 1.6; }
    p { line-height: 1.6; color: #b6c2cf; font-size: 14px; margin: 8px 0; }
    .alamat { color: #ffd479; font-weight: 600; word-break: break-all; }
    a { color: #7dd3fc; }
    .catatan { font-size: 13px; color: #8b98a5; }
  </style>
</head>
<body>
  <div class="kartu">
    <h1>💬 Ngobrol — Server</h1>
    <p class="nyala">● Server hidup dan siap dipakai.</p>

    <h2>Alamat server (untuk semua aplikasi)</h2>
    <p class="alamat">${asal}</p>
    <p>Tempel ini di kolom <b>Alamat server</b> aplikasi Android, atau pakai
       perintah di bawah. Jangan tambahkan <code>/</code> di akhir.</p>

    <h2>PC / laptop - CMD (Windows)</h2>
    <p>Salin baris di bawah ke <b>CMD</b>, tekan Enter (unduh + langsung jalan):</p>
    <pre>curl.exe -O ${asal}/cli.js && node cli.js --server ${asal}</pre>

    <h2>PC / laptop - PowerShell (Windows)</h2>
    <pre>Invoke-WebRequest ${asal}/cli.js -OutFile cli.js; node cli.js --server ${asal}</pre>

    <h2>Termux (Android)</h2>
    <p>Salin keduanya ke Termux:</p>
    <pre>pkg install -y nodejs
curl -O ${asal}/cli.js && node cli.js --server ${asal}</pre>

    <h2>Linux / macOS</h2>
    <pre>curl -O ${asal}/cli.js && node cli.js --server ${asal}</pre>

    <p class="catatan">Butuh <b>Node.js 22+</b>. Belum ada? Unduh gratis di
       <a href="https://nodejs.org">nodejs.org</a> (pilih LTS), lalu buka terminal lagi.</p>
    <p class="catatan">Jangan pakai <code>curl ... | node</code> - ketikan Anda tidak akan bisa masuk.</p>

    <h2>Android (aplikasi)</h2>
    <p>Buka aplikasi <b>Ngobrol</b> (berkas .apk), isi <b>Alamat server</b> di atas, lalu Daftar.
       Berkas .apk-nya dibagikan pemilik server, bukan dari halaman ini.</p>

    ${cadangan}

    <h2>Status</h2>
    <p><a href="/api/health">/api/health</a></p>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight();

    if (url.pathname === '/api/health') {
      return json({ ok: true, name: 'ngobrol-server', runtime: 'cloudflare-workers', at: Date.now() });
    }

    // Klien terminal — bisa diunduh dari mana saja (PC lain, Termux, dll).
    if (url.pathname === '/cli.js') {
      return new Response(CLI_SOURCE, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          ...AMAN,
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '') {
      // Tautan cadangan (opsional) — hanya dipakai kalau berupa alamat https.
      const gist = typeof env?.CLI_GIST === 'string' && /^https:\/\/[\w.\-/]+$/i.test(env.CLI_GIST)
        ? env.CLI_GIST
        : '';
      return new Response(halaman(url.origin, gist), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': CSP,
          ...AMAN,
        },
      });
    }

    // Semua yang lain (API + WebSocket) dilayani oleh satu Durable Object.
    const stub = env.CHAT.get(env.CHAT.idFromName('main'));
    return stub.fetch(request);
  },
};
