import 'package:flutter/material.dart';

import '../chat_service.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class SettingsScreen extends StatelessWidget {
  final Session session;
  final ChatService chat;

  const SettingsScreen({super.key, required this.session, required this.chat});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([session, chat]),
      builder: (context, _) {
        final tema = Theme.of(context).colorScheme;
        final (warna, teks) = switch (chat.status) {
          ConnStatus.connected => (AppColors.online, 'Terhubung'),
          ConnStatus.connecting => (AppColors.warning, 'Menyambungkan...'),
          ConnStatus.offline => (AppColors.danger, 'Terputus'),
        };

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
          children: [
            // ---- Kartu profil ----
            AppCard(
              padding: const EdgeInsets.all(18),
              radius: 22,
              child: Row(
                children: [
                  Avatar(name: session.username ?? '?', size: 62),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          session.username ?? '-',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text('Username kamu',
                            style: TextStyle(fontSize: 12.5, color: tema.onSurfaceVariant)),
                        const SizedBox(height: 8),
                        Container(
                          padding:
                              const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.fill(context),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            'ID ${session.userId ?? '-'}',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: tema.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ---- Sambungan ----
            const SectionLabel('Sambungan'),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _Baris(
                    icon: Icons.dns_outlined,
                    judul: session.serverUrl,
                    sub: 'Alamat server',
                    aksi: const Icon(Icons.edit_outlined, size: 20),
                    onTap: () => _editServer(context),
                  ),
                  Divider(height: 1, color: AppColors.hairline(context)),
                  _Baris(
                    icon: Icons.wifi_tethering_rounded,
                    judul: teks,
                    sub: chat.lastError == null
                        ? 'Lancar, tidak ada masalah'
                        : chat.lastError!,
                    warnaIcon: warna,
                    aksi: IconButton(
                      tooltip: 'Coba sambungkan lagi',
                      icon: const Icon(Icons.refresh_rounded, size: 20),
                      onPressed: chat.connect,
                    ),
                    onTap: chat.connect,
                  ),
                ],
              ),
            ),

            // ---- Keamanan ----
            const SectionLabel('Keamanan'),
            AppCard(
              padding: EdgeInsets.zero,
              child: _Baris(
                icon: Icons.lock_outline_rounded,
                judul: 'Ganti kata sandi',
                sub: 'Perangkat lain akan keluar otomatis',
                aksi: const Icon(Icons.chevron_right_rounded, size: 20),
                onTap: () => _gantiSandi(context),
              ),
            ),

            // ---- Bantuan singkat ----
            const SectionLabel('Cara pakai'),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  const _Baris(
                    icon: Icons.forum_outlined,
                    judul: 'Ngobrol bersama semua orang',
                    sub: 'Buka tab Grup, lalu tulis pesan',
                  ),
                  Divider(height: 1, color: AppColors.hairline(context)),
                  const _Baris(
                    icon: Icons.person_outline_rounded,
                    judul: 'Chat berdua saja',
                    sub: 'Buka tab Teman, lalu pilih namanya',
                  ),
                  Divider(height: 1, color: AppColors.hairline(context)),
                  const _Baris(
                    icon: Icons.notifications_active_outlined,
                    judul: 'Belum ada teman?',
                    sub: 'Minta mereka daftar juga — langsung muncul',
                  ),
                ],
              ),
            ),

            // ---- Tentang ----
            const SectionLabel('Tentang aplikasi'),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  const _Baris(
                    icon: Icons.chat_bubble_outline_rounded,
                    judul: 'Ngobrol',
                    sub: 'Versi 1.0.0',
                  ),
                  Divider(height: 1, color: AppColors.hairline(context)),
                  const _Baris(
                    icon: Icons.cloud_outlined,
                    judul: 'LAN & Cloudflare',
                    sub: 'Chat grup + pesan pribadi, satu server',
                  ),
                ],
              ),
            ),

            const SizedBox(height: 26),
            OutlinedButton.icon(
              onPressed: () => _keluar(context),
              icon: const Icon(Icons.logout_rounded, size: 20),
              label: const Text('Keluar dari akun'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.danger,
                minimumSize: const Size.fromHeight(50),
                side: BorderSide(color: AppColors.danger.withValues(alpha: 0.5)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                textStyle: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _editServer(BuildContext context) async {
    final ctrl = TextEditingController(text: session.serverUrl);
    final newUrl = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Alamat server'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                hintText: 'http://192.168.1.4:8080',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Contoh:\n• http://192.168.1.4:8080 (PC satu WiFi)\n'
              '• https://ngobrol-server.namamu.workers.dev (online)',
              style: TextStyle(
                fontSize: 12,
                height: 1.5,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context), child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(context, ctrl.text),
              child: const Text('Simpan')),
        ],
      ),
    );
    if (newUrl != null && newUrl.trim().isNotEmpty) {
      await session.setServerUrl(newUrl);
      chat.connect(); // langsung coba sambung ke alamat baru
    }
  }

  Future<void> _gantiSandi(BuildContext context) async {
    final berhasil = await showDialog<bool>(
      context: context,
      builder: (context) => _DialogGantiSandi(session: session),
    );
    if (berhasil == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Kata sandi sudah diganti. Perangkat lain keluar otomatis.'),
        ),
      );
    }
  }

  Future<void> _keluar(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: const Text('Kamu harus masuk lagi setelah ini. Akun & pesanmu tetap aman.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (ok == true) await session.signOut();
  }
}

/// Satu baris pengaturan (ikon + judul + keterangan + aksi).
class _Baris extends StatelessWidget {
  const _Baris({
    required this.icon,
    required this.judul,
    required this.sub,
    this.aksi,
    this.onTap,
    this.warnaIcon,
  });

  final IconData icon;
  final String judul;
  final String sub;
  final Widget? aksi;
  final VoidCallback? onTap;
  final Color? warnaIcon;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).colorScheme;
    final warna = warnaIcon ?? tema.primary;

    final isi = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: warna.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: warna),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  judul,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  sub,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: tema.onSurfaceVariant),
                ),
              ],
            ),
          ),
          if (aksi != null) aksi!,
        ],
      ),
    );

    if (onTap == null) return isi;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: isi,
    );
  }
}

/// Dialog sederhana untuk mengganti kata sandi (3 kolom).
class _DialogGantiSandi extends StatefulWidget {
  final Session session;

  const _DialogGantiSandi({required this.session});

  @override
  State<_DialogGantiSandi> createState() => _DialogGantiSandiState();
}

class _DialogGantiSandiState extends State<_DialogGantiSandi> {
  final _lama = TextEditingController();
  final _baru = TextEditingController();
  final _ulang = TextEditingController();
  bool _sibuk = false;
  String? _pesan;

  @override
  void dispose() {
    _lama.dispose();
    _baru.dispose();
    _ulang.dispose();
    super.dispose();
  }

  Future<void> _simpan() async {
    if (_baru.text.length < 6) {
      setState(() => _pesan = 'Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (_baru.text != _ulang.text) {
      setState(() => _pesan = 'Ulangi kata sandi baru belum sama.');
      return;
    }
    setState(() {
      _sibuk = true;
      _pesan = null;
    });
    try {
      await widget.session.changePassword(
        oldPassword: _lama.text,
        newPassword: _baru.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _sibuk = false;
          _pesan = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Ganti kata sandi'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Semua perangkat lain yang masih masuk akan otomatis keluar.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _lama,
              obscureText: true,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Kata sandi sekarang',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _baru,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Kata sandi baru',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ulang,
              obscureText: true,
              onSubmitted: (_) => _sibuk ? null : _simpan(),
              decoration: const InputDecoration(
                labelText: 'Ulangi kata sandi baru',
                border: OutlineInputBorder(),
              ),
            ),
            if (_pesan != null) ...[
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.error_outline_rounded,
                      size: 18, color: AppColors.danger),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _pesan!,
                      style: const TextStyle(
                        color: AppColors.danger,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sibuk ? null : () => Navigator.pop(context),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: _sibuk ? null : _simpan,
          child: _sibuk
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Simpan'),
        ),
      ],
    );
  }
}
