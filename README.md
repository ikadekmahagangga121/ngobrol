# 💬 Ngobrol — Aplikasi Chat Multi-Platform

Satu server chat, banyak platform: **Android** (APK Flutter), **CMD/terminal**
(Windows/Linux/macOS/**Termux**). Semua client terhubung ke server yang sama,
jadi semua bisa ngobrol bareng.

Server bisa dijalankan **dua cara**:

| | **Lokal (LAN)** | **Cloudflare (internet)** |
|---|---|---|
| Alamat | `http://192.168.1.4:8080` | `https://ngobrol-server.xxx.workers.dev` |
| Jangkauan | WiFi yang sama | **dari mana saja** |
| Butuh PC nyala | ya | **tidak** |
| Biaya | gratis | **gratis, tanpa kartu kredit** |

```
┌────────────┐                          ┌──────────────────┐
│  Android   │──┐                    ┌──│  Server Lokal    │
│  (APK)     │  │                    │  │  (Node.js :8080) │
└────────────┘  │   ┌────────────┐   │  └──────────────────┘
                ├──▶│  Satu Server│◀──┤
┌────────────┐  │   │   Chat      │   │  ┌──────────────────┐
│ CMD/Termux │──┘   └────────────┘   └──│ Server Cloudflare│
└────────────┘                          │  (gratis, 24 jam)│
                                        └──────────────────┘
```

## Fitur

- 🔓 Registrasi & login (username + password, password di-hash)
- 🗣️ **Room grup** — semua orang ngobrol di satu ruang
- 🔒 **Private message** — chat 1-on-1 dengan user lain
- 👥 Daftar pengguna + indikator **online/offline**
- ⌨️ Indikator *"sedang mengetik..."*
- 🔁 Riwayat chat tersimpan permanen di database
- 📶 Auto-reconnect — koneksi putus sebentar, aplikasi menyambung sendiri
- 📨 **Pesan tidak hilang saat lawan bicara offline** — pesan tetap tersimpan,
  dan begitu dia online lagi pesannya langsung dikirim otomatis (ada penanda
  "belum terkirim" kalau koneksi kita sendiri yang sedang putus)
- 🔐 **Ganti kata sandi** dari aplikasi / terminal — perangkat lain otomatis keluar

## Struktur

```
chat-app/
├── 1-JALANKAN-SERVER.bat        # klik: jalankan server lokal (LAN)
├── 2-BUKA-CHAT-CMD.bat          # klik: chat dari CMD (server lokal)
├── 3-DEPLOY-KE-CLOUDFLARE.bat   # klik: pasang server ke internet (gratis)
├── 4-UJI-CLOUDFLARE-LOKAL.bat   # klik: uji server Cloudflare di PC
├── 5-CHAT-CMD-ONLINE.bat        # klik: chat dari CMD (server online)
├── 6-PERBAIKI-WORKERD.bat       # klik: kalau uji lokal error "write EOF"
├── 7-IZINKAN-FIREWALL.bat       # klik: kalau HP/PC lain tidak bisa konek
├── 8-UJI-KEAMANAN.bat           # klik: cek keamanan + pesan offline server
├── 9-SIMPAN-CLI-KE-GIST.bat     # klik: taruh cli.js di GitHub Gist (opsional)
├── 10-PUSH-KE-GITHUB.bat        # klik: simpan seluruh kode ke GitHub (privat)
├── Ngobrol.apk                  # APK siap dipasang di HP (tidak ikut ke GitHub)
│
├── tools/
│   ├── push-gist.js             #    pengunggah cli.js ke GitHub Gist
│   ├── uji-gist.js              #    uji alat gist (server tiruan, tanpa GitHub)
│   ├── push-github.js           #    pengunggah proyek ke GitHub + pemindai rahasia
│   └── uji-github.js            #    uji alat push GitHub (tanpa internet)
│
├── client-pc/                   # 📁 SALIN folder ini ke PC/laptop lain
│   ├── CHAT-PC.bat              #    klik: langsung chat dari PC itu
│   ├── cli.js                   #    programnya (tanpa install apa pun)
│   └── BACA-INI.txt             #    panduan singkat
│
├── server/                      # Server versi LAN (Node.js)
│   ├── server.js                # Entry point (HTTP API + WebSocket)
│   ├── cli.js                   # Klien chat untuk CMD/terminal (tanpa dependency)
│   ├── src/
│   │   ├── db.js                # Database SQLite (users, sessions, messages, delivered)
│   │   ├── auth.js              # Registrasi, login, token, ganti kata sandi
│   │   ├── terkirim.js          # Penanda "pesan sudah sampai" (untuk kirim ulang)
│   │   ├── halaman.js           # Halaman browser: alamat + perintah siap salin
│   │   └── chat.js              # Logika WebSocket (grup, PM, presence, typing)
│   └── test/
│       ├── keamanan.js          # Uji keamanan (jalan sendiri, tanpa server terpisah)
│       ├── offline.js           # Uji pesan saat penerima offline
│       ├── uji-cli.js           # Uji klien terminal (/sandi)
│       └── simulate.js          # Uji otomatis 2 user (butuh server jalan)
│
├── cloudflare/                  # Server versi INTERNET (gratis, tanpa kartu)
│   ├── wrangler.toml            # Konfigurasi Cloudflare
│   ├── src/
│   │   ├── index.js             # Worker: routing + halaman status/panduan
│   │   ├── chat_room.js         # Durable Object: database + WebSocket
│   │   └── util.js              # Hash password (PBKDF2) + respons JSON
│   ├── test/unit.js             # 59 uji otomatis (tanpa internet)
│   ├── test/simulate.js         # Uji ke server yang sudah online
│   └── README.md                # Panduan deploy lengkap
│
└── app/                         # Aplikasi Android (Flutter)
    └── lib/
        ├── main.dart
        ├── session.dart         # Login + alamat server (tersimpan)
        ├── chat_service.dart    # Koneksi WebSocket + daftar pesan
        └── screens/             # Login, Home, Chat, Pengaturan
```

## 🚀 Cara Pakai

### 1. Pilih & jalankan server

**Cara A — Lokal (LAN, paling cepat):**

Klik dua kali **`1-JALANKAN-SERVER.bat`**. Server menampilkan alamatnya, misal
`http://192.168.1.5:8080`. HP harus **1 WiFi yang sama** dengan PC.

**Cara B — Cloudflare (bisa dari mana saja, gratis):**

Klik dua kali **`3-DEPLOY-KE-CLOUDFLARE.bat`** → login/buat akun Cloudflare
gratis di browser → tunggu → muncul alamat `https://....workers.dev`.

> Panduan lengkap: [`cloudflare/README.md`](cloudflare/README.md)

### 2. Install aplikasi Android

File APK sudah tersedia di:

```
Ngobrol.apk                      ← paling gampang, ada di folder ini
app/build/app/outputs/flutter-apk/app-release.apk
```

Kirim ke HP (kabel / WhatsApp / Bluetooth / Google Drive), lalu buka di HP untuk
install (izinkan *"install dari sumber tidak dikenal"*).

Saat pertama buka: isi **Alamat server** (sesuai langkah 1), lalu **Daftar**.

### 3. Chat dari komputer (CMD) atau Termux

- **Windows, server lokal:** klik `2-BUKA-CHAT-CMD.bat`
- **Windows, server online:** klik `5-CHAT-CMD-ONLINE.bat`, tempel alamatnya
- **PC / laptop LAIN:** salin folder **`client-pc/`** ke PC itu (flashdisk /
  OneDrive / WhatsApp), lalu klik `CHAT-PC.bat` di sana → tempel alamat server.
  Di PC itu cukup ada **Node.js** (unduh sekali di https://nodejs.org, tanpa
  `npm install`). Masuk dari internet? Pakai alamat Cloudflare — PC itu tidak
  perlu 1 WiFi denganmu.
- **Termux / Linux / macOS:** tidak perlu kirim file — klien bisa **diunduh dari server**
  ```bash
  # Termux (Android): sekali saja
  pkg install nodejs

  curl -O https://ngobrol-server.xxx.workers.dev/cli.js
  node cli.js --server https://ngobrol-server.xxx.workers.dev
  ```

> 📋 **Cara paling gampang:** buka **alamat servernya di browser**
> (mis. `https://ngobrol-server.xxx.workers.dev` atau `http://192.168.1.4:8080`).
> Di halaman itu sudah tertera **alamat server** + **perintah siap salin** untuk
> CMD, PowerShell, Termux, dan Linux — cukup salin 1 baris, tempel, Enter.

> 🌍 **Beda jaringan (beda WiFi / pakai data seluler)?** Wajib pakai alamat
> **Cloudflare** (`https://...workers.dev`). Alamat LAN (`192.168.1.4`) hanya
> bisa dari WiFi yang sama. Aplikasi Android, CMD, dan Termux semuanya
> mendukung alamat Cloudflare ini.
>
> 📶 **PC/HP lain tidak bisa konek ke server lokal?** Di PC server, klik
> `7-IZINKAN-FIREWALL.bat` (Windows Firewall sering memblokir port 8080).
> Pastikan alamatnya **IP PC server** (mis. `192.168.1.4`), **bukan** `127.0.0.1`.

Isi username & password saat diminta. Di dalam chat:

```
teks biasa          → kirim ke room grup
/w <user> <pesan>   → kirim pesan private
/users              → daftar pengguna
/sandi              → ganti kata sandi akunmu
/help               → bantuan
/quit               → keluar
```

### 🔗 Taruh `cli.js` di GitHub Gist (opsional, biar gampang dibagikan)

Supaya teman bisa mengambil klien terminal lewat **satu link** — tanpa Anda
kirim file, dan **tanpa server Anda harus hidup**:

**Cara paling gampang (lewat browser, tanpa install apa pun):**
1. Buka https://gist.github.com
2. Isi **Filename** dengan: `cli.js`
3. Buka `chat-app\server\cli.js` dengan Notepad → **Ctrl+A**, **Ctrl+C** → tempel
   ke kotak isi gist (atau seret filenya ke halaman itu)
4. Klik **Create secret gist** (rahasia/unlisted — hanya yang punya link) atau
   **Create public gist**
5. Klik tombol **Raw**, lalu **hapus bagian kode acak** setelah `/raw/`
   supaya link selalu menunjuk versi terbaru. Contoh link yang benar:

   ```
   https://gist.githubusercontent.com/namamu/a1b2c3d4/raw/cli.js
   ```

**Cara otomatis (dari PC ini):** klik `9-SIMPAN-CLI-KE-GIST.bat` — cukup tempel
token GitHub sekali (petunjuk muncul di jendelanya). Alat ini sekaligus
**memperbarui gist yang sama** kalau `cli.js` nanti berubah, jadi linknya tetap.

Teman Anda tinggal menempel **satu baris** ini di terminal:

```
Windows CMD :  curl.exe -O <link-raw> && node cli.js
PowerShell  :  Invoke-WebRequest <link-raw> -OutFile cli.js; node cli.js
Termux/Linux:  curl -O <link-raw> && node cli.js
```

> ⚠️ Jangan pakai cara `curl <link> | node`. Perintah itu menghabiskan
> masukan keyboard, jadi Anda tidak bisa mengetik username/pesan. Unduh dulu
> ke file (`-O`), baru jalankan `node cli.js`.
>
> 🔒 Isi `cli.js` tidak memuat kata sandi apa pun — aman dibagikan. Yang perlu
> dirahasiakan hanya alamat server + akun Anda.

## 🔐 Simpan Kode ke GitHub (repo privat)

Seluruh kode proyek bisa disimpan ke GitHub **sebagai repository privat** —
hanya Anda yang bisa melihatnya. Teman tetap bisa mengambil `cli.js` lewat
gist/server Anda (bagian di atas), jadi tidak ada yang terhalang.

**Sekali klik:** jalankan **`10-PUSH-KE-GITHUB.bat`**

1. Tempel **token GitHub** (gratis, sekali saja):
   buka https://github.com/settings/tokens/new → isi nama bebas (mis.
   `ngobrol-push`) → centang kotak **[x] repo** → *Generate token* → salin.
2. Pilih sifat repo: **1 = privat** (disarankan) atau `2 = publik`.
3. Selesai — repo `ngobrol` dibuat dan seluruh kode dikirim.

**Pengaman otomatis** (tidak perlu diatur):

| Pengaman | Cara kerja |
|---|---|
| Pemindai rahasia | Sebelum mengirim, isi setiap berkas diperiksa. Kalau ada token / kunci privat / kata sandi yang mau ikut, pengiriman **dibatalkan** dan berkasnya disebutkan. |
| APK & database dipisah | `Ngobrol.apk` (49 MB), `data/` (database akun), `.env`, dan `tools/gist-id.txt` otomatis **tidak ikut** (lihat `.gitignore`). |
| Token tidak disimpan | Token hanya dipakai selama jendela `.bat` terbuka — tidak ditulis ke berkas, tidak ikut ter-commit, dan tidak pernah ditampilkan. |
| Akses tanpa sandi | Token dipakai sekali untuk mengirim, jadi tidak tersimpan di `.git/config`. |

Ukuran yang dikirim hanya **±0,4 MB** (82 berkas kode & dokumen).

**Pembaruan berikutnya:** jalankan `10-PUSH-KE-GITHUB.bat` lagi —
perubahannya dikirim sebagai commit baru.

> 🧪 Ingin mengetes tanpa internet sama sekali? `node tools/uji-github.js` —
> memakai server GitHub tiruan dan repo git lokal (18 uji, tanpa token asli).

## ⚙️ Perintah berguna

| Perintah | Fungsi |
|----------|--------|
| `cd server && npm start` | Jalankan server lokal |
| `cd server && npm test` | Uji keamanan + pesan offline + CLI (jalan sendiri) |
| `cd server && npm run test:simulasi` | Uji obrolan 2 user (server harus jalan) |
| `cd cloudflare && npm test` | 59 uji server Cloudflare (tanpa internet) |
| `cd cloudflare && npm run deploy` | Pasang/perbarui server Cloudflare |
| `cd cloudflare && npm run tail` | Lihat log server online |
| `node tools/push-gist.js` | Taruh/perbarui `cli.js` di GitHub Gist (butuh `GITHUB_TOKEN`) |
| `node tools/uji-gist.js` | Uji alat Gist di atas (pakai server tiruan, tanpa GitHub) |
| `node tools/push-github.js` | Unggah seluruh kode ke GitHub (repo **privat**, butuh `GITHUB_TOKEN`) |
| `node tools/uji-github.js` | Uji alat push GitHub + pemindai rahasia (18 uji, tanpa internet) |

> 🖼️ **Halaman server** (`/`) bisa dibuka di browser: menampilkan alamat server
> dan perintah siap salin. Untuk server Cloudflare, tautan cadangan (gist)
> muncul di halaman itu bila diatur lewat `CLI_GIST` di `cloudflare/wrangler.toml`.

## 📨 Pesan saat lawan bicara sedang offline

Pesan **tidak pernah hilang** meskipun salah satu sedang tidak tersambung:

| Kejadian | Yang terjadi |
|---|---|
| Lawan bicara **sedang offline** | Pesan tetap disimpan di server. Begitu dia online lagi, semua pesan yang tertinggal **dikirim otomatis** — tidak perlu membuka chat dulu. |
| **Kita** yang sedang offline (koneksi putus) | Pesan yang kita tulis **ditahan** dulu di HP, lalu dikirim otomatis begitu tersambung. Ada tulisan *"...pesan akan terkirim otomatis"* di atas kolom ketik. |
| Aplikasi ditutup / HP restart | Pesan yang belum sampai akan dikirim lagi saat aplikasi dibuka. Pesan yang sama tidak tampil dua kali. |
| Online kembali setelah lama | Hanya pesan yang benar-benar belum pernah diterima yang dikirim ulang (maksimal 300 pesan terakhir sekaligus). |

Teknis: server menyimpan penanda *"pesan terakhir yang sudah sampai ke tiap pengguna"*
(`delivered.last_id`). Saat tersambung, server mengirim semua pesan di atas penanda
itu. Aplikasi juga menolak pesan kembar berdasarkan `id` pesan, jadi tidak ada dobel.

## 🔐 Keamanan

Perlindungan yang sudah aktif di **kedua server** (lokal & Cloudflare):

| Perlindungan | Keterangan |
|---|---|
| **Hash kata sandi** | bcrypt (lokal) & PBKDF2-SHA256 100.000 putaran (Cloudflare). Sandi asli tidak pernah disimpan. |
| **Token acak 64 karakter** | Dihasilkan dari 32 byte acak (crypto), bukan tebakan. |
| **Token kedaluwarsa** | Otomatis tidak berlaku setelah **90 hari** (sesi lama dibersihkan saat server mulai). |
| **Batas login** | 10 percobaan gagal per IP tiap 15 menit → jawaban **429** "Terlalu banyak percobaan". |
| **Batas pendaftaran** | 10 akun baru per IP tiap jam — mencegah pembuatan akun massal. |
| **Anti-spam pesan** | Maksimal **15 pesan per 5 detik** per pengguna; pelaku diberi tahu, bukan dibisukan. |
| **Batas panjang pesan** | Maksimal **2000 karakter** (sandi maksimal 72 karakter). |
| **Waktu jawaban seragam** | Username yang tidak ada diproses seperti username yang ada, jadi tidak bisa ditebak dari kecepatan balasan. |
| **Header pengaman** | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS, dan CSP di halaman status Cloudflare. |
| **Batas ukuran permintaan** | Body HTTP dibatasi 16 KB (lokal) — mencegah kiriman raksasa. |
| **Ganti kata sandi** | Bisa dari aplikasi Android (Pengaturan → Keamanan) atau `/sandi` di terminal. Semua perangkat lain langsung keluar. |
| **HTTPS** | Otomatis di Cloudflare. Server lokal masih HTTP — aman untuk WiFi sendiri. |

> ⚠️ Server lokal **belum memakai TLS**. Jangan dibuka ke internet publik tanpa
> HTTPS/VPN. Untuk akses dari internet, pakai versi Cloudflare (sudah HTTPS).
>
> 🔓 **Kata sandi yang lemah tetap bisa ditebak.** Gunakan minimal 8 karakter dan
> jangan pakai kata sandi yang sama dengan akun lain.

### 🔄 Update server yang sudah berjalan — data tetap aman

Kode server bisa diganti kapan saja **tanpa kehilangan akun atau riwayat chat**.

**Cloudflare (paling mudah):**

```bash
cd cloudflare
npm run deploy        # atau klik ulang 3-DEPLOY-KE-CLOUDFLARE.bat
```

Kode lama langsung diganti kode baru dalam beberapa detik. Database (akun, sesi,
pesan) tersimpan di **Durable Object** dan tetap utuh. Semua orang tetap login.

**Server lokal (Node):**

1. Tutup jendela server yang sedang jalan (atau tekan `Ctrl+C`).
2. Klik ulang **`1-JALANKAN-SERVER.bat`**.

Akun dan pesan tetap ada karena tersimpan di file `server/data/chat.db`.
Sesi login juga tersimpan di database, jadi **pengguna tetap login** — tidak
perlu masuk ulang. (Kalau sandi di-hash dengan biaya bcrypt lama, hash otomatis
dibuat ulang saat login berikutnya.)

> 💡 Ingin mengetes hasil update dulu? `cd server && npm test` (uji keamanan)
> dan `cd cloudflare && npm test` (uji Cloudflare) — keduanya jalan tanpa internet.
