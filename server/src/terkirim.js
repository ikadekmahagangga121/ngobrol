'use strict';

// Pelacak "sampai mana pesan sudah sampai ke pengguna".
//
//   delivered.last_id = id pesan terakhir yang sudah pernah dikirim ke pengguna itu.
//
// Saat pengguna tersambung kembali, semua pesan di atas angka itu dikirim ulang
// (lihat catchUp di chat.js). Dengan begitu pesan yang dikirim ketika penerima
// sedang offline tetap sampai begitu dia online — tanpa dikirim dua kali.

const { db } = require('./db');

/** Id pesan terakhir di seluruh database (0 kalau belum ada pesan). */
function idTerakhir() {
  const row = db.prepare('SELECT IFNULL(MAX(id), 0) AS m FROM messages').get();
  return Number(row.m);
}

/** Id pesan terakhir yang sudah sampai ke pengguna ini. */
function kursor(userId) {
  const row = db.prepare('SELECT last_id FROM delivered WHERE user_id = ?').get(userId);
  return row ? Number(row.last_id) : 0;
}

/** Tandai: semua pesan sampai id tertentu sudah sampai ke pengguna ini. */
function simpanKursor(userId, sampai = idTerakhir()) {
  db.prepare('INSERT OR REPLACE INTO delivered (user_id, last_id) VALUES (?, ?)')
    .run(userId, sampai);
}

/**
 * Buat penanda untuk pengguna yang belum punya. Dipakai saat daftar & login:
 * pengguna baru (atau pengguna lama sebelum fitur ini ada) tidak dibanjiri
 * pesan-pesan lama — riwayat tetap bisa dibuka di aplikasi.
 */
function pastikanKursor(userId) {
  db.prepare('INSERT OR IGNORE INTO delivered (user_id, last_id) VALUES (?, ?)')
    .run(userId, idTerakhir());
}

module.exports = { idTerakhir, kursor, simpanKursor, pastikanKursor };
