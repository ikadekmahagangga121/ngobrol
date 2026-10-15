# ☁️ Server Ngobrol di Cloudflare Workers

Versi server ini jalan **di internet**, **gratis selamanya**, dan **tanpa kartu kredit**.
Semua fitur sama dengan versi lokal (server Node): daftar akun, login, room grup,
private message, status online, indikator mengetik, dan riwayat chat.

| | Versi Node lokal | Versi Cloudflare |
|---|---|---|
| Jaringan | WiFi yang sama | **dari mana saja** (internet) |
| Alamat | `http://192.168.1.4:8080` | `https://ngobrol-server.xxx.workers.dev` |
| Runtime | PC harus menyala | **nyala terus** |
| Database | file `chat.db` | SQLite di Durable Object (permanen) |
| Biaya | gratis | **gratis, tanpa kartu kredit** |

---

## 🚀 Cara deploy (sekali saja)

### Cara paling gampang: klik dua kali

1. Klik dua kali **`3-DEPLOY-KE-CLOUDFLARE.bat`** (ada di folder `chat-app`).
2. Browser akan terbuka → **login / buat akun Cloudflare gratis** → klik **Allow**.
3. Tunggu sebentar. Di akhir akan muncul alamat server, contoh:

   ```
   https://ngobrol-server.alamatmu.workers.dev
   ```

4. **Salin alamat itu** — itulah "Alamat server" untuk aplikasi Android / CMD / Termux.

### Cara manual (lewat terminal)

```bash
cd cloudflare
npm install
npx wrangler login     # sekali saja, buka browser
npx wrangler deploy
```

> Jika `npm install` memblokir skrip instalasi (kebijakan npm baru), jalankan:
> `npm install-scripts approve esbuild workerd` lalu `npm install` lagi.

---

## 📱 Memakai alamat server di aplikasi

Masukkan alamatnya **tanpa garis miring di akhir**:

| Klien | Cara |
|---|---|
| **Android (APK)** | Buka aplikasi → isi **Alamat server** → `https://ngobrol-server.xxx.workers.dev` |
| **CMD (Windows)** | Klik `5-CHAT-CMD-ONLINE.bat`, tempel alamatnya |
| **Termux / Linux / macOS** | `node cli.js --server https://ngobrol-server.xxx.workers.dev` |

Aplikasi otomatis mengubah `https://` menjadi `wss://` untuk koneksi realtime,
jadi **tidak perlu diatur lagi**.

---

## 🌍 Memakai dari JARINGAN LAIN (beda WiFi / data seluler)

Ini alasan utama pakai Cloudflare. Alamat LAN (`192.168.1.4`) **hanya** bisa
diakses dari WiFi yang sama — kalau HP/PC lain beda jaringan, pakai alamat
Cloudflare. Semua **hanya butuh satu alamat**:

```
https://ngobrol-server.namamu.workers.dev
```

| Klien | Di jaringan lain (data seluler / WiFi berbeda) |
|---|---|
| **Android (APK)** | Isi alamat itu di **Alamat server** → langsung jalan |
| **Windows CMD** | `node cli.js --server https://ngobrol-server.namamu.workers.dev`<br>atau klik `CHAT-PC.bat` lalu tempel alamatnya |
| **Termux (Android)** | lihat 3 baris di bawah ⬇️ |
| **Linux / macOS** | sama seperti CMD |

### 📱 Termux — 3 baris, tanpa kirim file

Klien bisa **diunduh langsung dari server**, jadi tidak perlu transfer file:

```bash
pkg install nodejs
curl -O https://ngobrol-server.namamu.workers.dev/cli.js
node cli.js --server https://ngobrol-server.namamu.workers.dev
```

Isi username & password saat diminta. Selesai — sudah bisa ngobrol bareng
HP (APK), PC rumah, dan siapa pun yang punya alamat itu.

> 💡 Halaman utama server (`https://…workers.dev`) menampilkan perintah ini
> lengkap dengan alamatmu — tinggal salin.

## 🧪 Uji server

### Uji cepat — tidak perlu apa pun (paling gampang)

```bash
cd cloudflare
npm test          # 59 pemeriksaan: daftar, login, grup, privat, presence, riwayat,
                  # pesan saat penerima offline, halaman panduan, ganti kata sandi,
                  # batas percobaan, anti-spam, header keamanan…
```

Uji ini menjalankan **kode server yang asli** langsung di Node, jadi tidak butuh
workerd/Cloudflare. Hasilnya:

```
Hasil: 59 lulus, 0 gagal
```

### Uji server yang sudah online

```bash
# Linux / macOS / Termux
BASE_URL=https://ngobrol-server.xxx.workers.dev node test/simulate.js
```
```powershell
# Windows PowerShell
$env:BASE_URL="https://ngobrol-server.xxx.workers.dev"; node test/simulate.js
```

### Uji server lokal (opsional)

```bash
npm run dev                      # wrangler dev → http://127.0.0.1:8787
```
atau tanpa wrangler:
```bash
npm run dev:lokal                # Miniflare → http://127.0.0.1:8787
```
lalu di jendela lain: `node test/simulate.js`

> ⚠️ **Kalau muncul `Error: write EOF`** artinya komputer belum punya
> **Microsoft Visual C++ Redistributable** (dibutuhkan oleh `workerd`, mesin di
> balik `wrangler dev`). Klik dua kali **`6-PERBAIKI-WORKERD.bat`** di folder
> `chat-app` untuk memasangnya (perlu izin Administrator).
> Ini **tidak** diperlukan untuk deploy — hanya untuk uji lokal.

---

## 🔎 Melihat log server online

```bash
cd cloudflare
npx wrangler tail
```

---

## 🔐 Keamanan & cara memperbarui server yang sudah jalan

Server versi ini punya perlindungan berikut:

| Perlindungan | Keterangan |
|---|---|
| Hash kata sandi | **PBKDF2-SHA256 100.000 putaran** (WebCrypto) — sandi asli tidak disimpan |
| Token login | 32 byte acak (64 karakter hex) |
| Masa berlaku token | **90 hari**, lalu harus login ulang |
| Batas login | 10 percobaan gagal per IP tiap 15 menit → **429** |
| Batas pendaftaran | 10 akun baru per IP tiap jam → **429** |
| Anti-spam | Maksimal 15 pesan / 5 detik per pengguna |
| Batas panjang | Pesan maksimal 2000 karakter, sandi maksimal 72 karakter |
| Header pengaman | nosniff, X-Frame-Options, Referrer-Policy, HSTS, CSP |
| Transport | **HTTPS/WSS otomatis** (Cloudflare) |
| Ganti kata sandi | Dari aplikasi Android (Pengaturan → Keamanan) atau `/sandi` di terminal; perangkat lain langsung keluar |
| Pesan saat offline | Pesan tetap tersimpan dan dikirim otomatis saat penerima online kembali (penanda `delivered.last_id` per pengguna) |

### Memperbarui server yang sudah berjalan (data tidak hilang)

```bash
cd cloudflare
npm run deploy          # atau klik ulang 3-DEPLOY-KE-CLOUDFLARE.bat
```

Kode baru langsung menggantikan kode lama dalam beberapa detik. **Akun, sesi, dan
riwayat chat tetap aman** karena semuanya tersimpan di SQLite milik Durable
Object — deploy hanya mengganti programnya, bukan datanya. Pengguna yang sedang
online tidak perlu login ulang.

> ⚠️ Perubahan yang mengubah skema database tidak dijalankan otomatis. Kode ini
> hanya memakai `CREATE TABLE IF NOT EXISTS`, jadi tabel lama dibiarkan apa
> adanya dan aman untuk deploy berulang.

---

## 📊 Batas paket gratis (2026)

| | Batas gratis | Artinya |
|---|---|---|
| Permintaan | 100.000 / hari | 1 pesan chat = 1 permintaan → masih sangat longgar |
| Durasi | 13.000 GB-detik / hari | lebih dari cukup untuk obrolan kecil |
| Database | beberapa GB (SQLite) | ribuan pesan tersimpan permanen |

Kalau suatu saat lewat batas, operasi akan gagal sementara dan **pulih sendiri
pukul 00.00 UTC** (07.00 WIB). Tidak akan tiba-tiba ditagih.

---

## 📝 Catatan penting

- **Akun lokal tidak pindah otomatis.** Karena Cloudflare memakai pengamanan
  password berbeda (PBKDF2, bukan bcrypt), akun yang dibuat di server lokal
  harus **daftar ulang** di server Cloudflare.
- Server Cloudflare memakai **satu Durable Object** (`ChatRoom`) sebagai pusat
  room grup "Umum" — sama seperti satu server Node.
- Ganti nama/alamat server: ubah `name` di `wrangler.toml`, lalu deploy lagi.
- **Halaman panduan** di alamat server (`/`) menampilkan alamat server + perintah
  siap salin (CMD, PowerShell, Termux, Linux) + tautan unduh `/cli.js`.
  Tautan cadangan (mis. GitHub Gist) muncul di situ bila `CLI_GIST` diisi di
  `wrangler.toml` (kosongkan `""` untuk menyembunyikannya).
- **Hapus server:** `npx wrangler delete` (atau lewat dashboard Cloudflare).
