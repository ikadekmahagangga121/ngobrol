// Helper bersama: respons JSON, CORS, dan hashing password.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Header pengaman standar. Server Cloudflare selalu HTTPS, jadi HSTS aman
// dipasang: browser diwajibkan memakai HTTPS untuk semua kunjungan berikutnya.
export const AMAN = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
};

const AMAN_JSON = { ...CORS, ...AMAN };

/** Respons JSON dengan header CORS + header pengaman. */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...AMAN_JSON },
  });
}

/** Jawaban untuk preflight OPTIONS. */
export function preflight() {
  return new Response(null, { status: 204, headers: AMAN_JSON });
}

// --------------------------------------------------------------- password
// Cloudflare Workers (paket gratis) membatasi waktu CPU, jadi bcrypt terlalu
// berat. Kita pakai PBKDF2-SHA256 dari WebCrypto — native, cepat, dan aman.

const ITERASI = 100000;
const enc = new TextEncoder();

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function keBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function dariBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Format: pbkdf2$<iterasi>$<salt-base64>$<hash-base64> */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERASI);
  return `pbkdf2$${ITERASI}$${keBase64(salt)}$${keBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [skema, iterasi, saltB64, hashB64] = String(stored).split('$');
    if (skema !== 'pbkdf2') return false;
    const expected = dariBase64(hashB64);
    const actual = await pbkdf2(password, dariBase64(saltB64), Number(iterasi));
    if (actual.length !== expected.length) return false;
    let beda = 0;
    for (let i = 0; i < actual.length; i++) beda |= actual[i] ^ expected[i];
    return beda === 0;
  } catch {
    return false;
  }
}

/** Token sesi acak 32 byte (64 karakter hex) — sama seperti versi Node. */
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
