import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Halaman masuk — dibuat sesederhana mungkin:
/// cukup nama & sandi. Alamat server disembunyikan di bagian "Alamat server".
class LoginScreen extends StatefulWidget {
  final Session session;

  const LoginScreen({super.key, required this.session});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _serverCtrl = TextEditingController(text: widget.session.serverUrl);
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _ulangCtrl = TextEditingController();

  bool _registerMode = false;
  bool _busy = false;
  bool _lihatSandi = false;
  bool _bukaAlamat = false;
  String? _error;

  /// true = gagal karena tidak bisa menyambung ke server (bukan salah sandi).
  bool _errorJaringan = false;

  @override
  void dispose() {
    _serverCtrl.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    _ulangCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _errorJaringan = false;
    });

    await widget.session.setServerUrl(_serverCtrl.text);
    final url = '${widget.session.serverUrl}/api/${_registerMode ? 'register' : 'login'}';
    try {
      final res = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'username': _userCtrl.text.trim(),
          'password': _passCtrl.text,
        }),
      ).timeout(const Duration(seconds: 10));

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200 || res.statusCode == 201) {
        final user = data['user'] as Map<String, dynamic>;
        await widget.session.signIn(
          token: data['token'] as String,
          userId: user['id'] as int,
          username: user['username'] as String,
        );
        // Beranda muncul sendiri setelah login.
      } else {
        setState(() => _error = data['error'] as String? ?? 'Gagal (${res.statusCode}).');
      }
    } catch (_) {
      setState(() {
        _error = 'Tidak bisa menyambung ke server.\n'
            'Periksa internetmu, atau periksa "Alamat server" di bawah.';
        _errorJaringan = true;
        _bukaAlamat = true; // langsung tampilkan supaya mudah diperbaiki
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _simpanAlamat() async {
    final t = _serverCtrl.text.trim();
    if (t.isEmpty) return;
    await widget.session.setServerUrl(t);
    if (!mounted) return;
    setState(() {
      _serverCtrl.text = widget.session.serverUrl;
      _error = null;
      _errorJaringan = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Alamat server disimpan.')),
    );
  }

  InputDecoration _kolom(
    BuildContext context, {
    String? label,
    String? hint,
    IconData? icon,
    Widget? suffix,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return InputDecoration(
      labelText: (label == null || label.isEmpty) ? null : label,
      hintText: hint,
      prefixIcon: icon == null ? null : Icon(icon, size: 20),
      suffixIcon: suffix,
      filled: true,
      fillColor: AppColors.fill(context),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.hairline(context)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.primary, width: 1.6),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.error, width: 1.6),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final gelap = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gelap
                ? const [Color(0xFF1B1B2E), Color(0xFF0E0F16)]
                : const [Color(0xFFE9E6FF), Color(0xFFF3F4FA)],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 36, 24, 32),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // ---------- Logo & judul ----------
                      Center(
                        child: Container(
                          width: 84,
                          height: 84,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [AppTheme.seed, Color(0xFF9B8CFF)],
                            ),
                            borderRadius: BorderRadius.circular(26),
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.seed.withValues(alpha: 0.35),
                                blurRadius: 22,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: const Icon(Icons.forum_rounded,
                              color: Colors.white, size: 44),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Ngobrol',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                          color: scheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Ngobrol bareng teman.\nCukup isi nama dan sandi.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: scheme.onSurfaceVariant, height: 1.45),
                      ),
                      const SizedBox(height: 26),

                      // ---------- Kartu utama ----------
                      AppCard(
                        padding: const EdgeInsets.all(18),
                        radius: 22,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _ModeToggle(
                              registerMode: _registerMode,
                              onChanged: (reg) => setState(() {
                                _registerMode = reg;
                                _error = null;
                                _errorJaringan = false;
                              }),
                            ),
                            const SizedBox(height: 20),
                            TextFormField(
                              controller: _userCtrl,
                              textInputAction: TextInputAction.next,
                              style: const TextStyle(fontSize: 15.5),
                              decoration: _kolom(
                                context,
                                label: 'Nama pengguna',
                                hint: 'contoh: budi',
                                icon: Icons.person_outline,
                              ),
                              validator: (v) {
                                final t = (v ?? '').trim();
                                if (t.length < 3 || t.length > 20) return '3-20 karakter';
                                if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(t)) {
                                  return 'Hanya huruf, angka, underscore';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: _passCtrl,
                              obscureText: !_lihatSandi,
                              style: const TextStyle(fontSize: 15.5),
                              decoration: _kolom(
                                context,
                                label: 'Kata sandi',
                                hint: 'minimal 6 huruf',
                                icon: Icons.lock_outline,
                                suffix: IconButton(
                                  tooltip: _lihatSandi ? 'Sembunyikan sandi' : 'Lihat sandi',
                                  icon: Icon(
                                    _lihatSandi
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined,
                                    size: 20,
                                  ),
                                  onPressed: () =>
                                      setState(() => _lihatSandi = !_lihatSandi),
                                ),
                              ),
                              validator: (v) =>
                                  (v ?? '').length < 6 ? 'Minimal 6 karakter' : null,
                              onFieldSubmitted: (_) {
                                if (!_registerMode) _submit();
                              },
                            ),
                            if (_registerMode) ...[
                              const SizedBox(height: 14),
                              TextFormField(
                                controller: _ulangCtrl,
                                obscureText: !_lihatSandi,
                                style: const TextStyle(fontSize: 15.5),
                                decoration: _kolom(
                                  context,
                                  label: 'Ulangi kata sandi',
                                  icon: Icons.lock_reset_outlined,
                                ),
                                validator: (v) =>
                                    v != _passCtrl.text ? 'Kata sandi tidak sama' : null,
                                onFieldSubmitted: (_) => _submit(),
                              ),
                            ],
                            if (_error != null) ...[
                              const SizedBox(height: 16),
                              _KotakPesan(
                                teks: _error!,
                                tombol: _errorJaringan && !_bukaAlamat
                                    ? 'Perbaiki alamat server'
                                    : null,
                                onTombol: () => setState(() => _bukaAlamat = true),
                              ),
                            ],
                            const SizedBox(height: 20),
                            FilledButton(
                              onPressed: _busy ? null : _submit,
                              style: FilledButton.styleFrom(
                                minimumSize: const Size.fromHeight(52),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                textStyle: const TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w700),
                              ),
                              child: _busy
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2.4, color: Colors.white),
                                    )
                                  : Text(_registerMode
                                      ? 'Daftar Sekarang'
                                      : 'Masuk Sekarang'),
                            ),

                            // ---------- Alamat server (opsional) ----------
                            const SizedBox(height: 6),
                            const Divider(height: 24),
                            _bagianAlamat(context),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _registerMode
                            ? 'Sudah punya akun? Pilih "Masuk" di atas.'
                            : 'Baru pertama kali? Pilih "Daftar" di atas, lalu buat nama & sandi.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.5,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Bagian "Alamat server": tertutup secara default (tidak membingungkan pemula).
  Widget _bagianAlamat(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _bukaAlamat = !_bukaAlamat),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
            child: Row(
              children: [
                Icon(Icons.dns_outlined, size: 20, color: scheme.onSurfaceVariant),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Alamat server',
                          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(
                        _serverCtrl.text.isEmpty ? 'belum diatur' : _serverCtrl.text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11.5, color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                Icon(
                  _bukaAlamat ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: scheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
        if (_bukaAlamat) ...[
          const SizedBox(height: 6),
          TextField(
            controller: _serverCtrl,
            keyboardType: TextInputType.url,
            style: const TextStyle(fontSize: 15),
            onChanged: (_) => setState(() {}),
            decoration: _kolom(
              context,
              hint: 'http://192.168.1.4:8080',
              icon: Icons.link_rounded,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Minta alamat ini ke orang yang memberi kamu aplikasi ini. '
            'Contoh: http://192.168.1.4:8080 (rumah) atau '
            'https://ngobrol-server.namamu.workers.dev (internet).',
            style: TextStyle(fontSize: 12, height: 1.5, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _serverCtrl.text.trim().isEmpty ? null : _simpanAlamat,
            icon: const Icon(Icons.save_outlined, size: 18),
            label: const Text('Simpan alamat'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ],
    );
  }
}

/// Kotak pesan kesalahan yang ramah.
class _KotakPesan extends StatelessWidget {
  const _KotakPesan({required this.teks, this.tombol, this.onTombol});

  final String teks;
  final String? tombol;
  final VoidCallback? onTombol;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline, size: 20, color: scheme.onErrorContainer),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  teks,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: scheme.onErrorContainer,
                  ),
                ),
              ),
            ],
          ),
          if (tombol != null) ...[
            const SizedBox(height: 6),
            TextButton(
              onPressed: onTombol,
              style: TextButton.styleFrom(foregroundColor: scheme.onErrorContainer),
              child: Text(tombol!),
            ),
          ],
        ],
      ),
    );
  }
}

/// Sakelar besar "Masuk / Daftar" — jelas untuk pemula.
class _ModeToggle extends StatelessWidget {
  const _ModeToggle({required this.registerMode, required this.onChanged});

  final bool registerMode;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.fill(context),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          _bagian(context, 'Masuk', !registerMode, () => onChanged(false)),
          _bagian(context, 'Daftar', registerMode, () => onChanged(true)),
        ],
      ),
    );
  }

  Widget _bagian(BuildContext context, String label, bool aktif, VoidCallback tap) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: tap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(vertical: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: aktif ? AppColors.surface(context) : Colors.transparent,
            borderRadius: BorderRadius.circular(11),
            boxShadow: aktif
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 15,
              fontWeight: aktif ? FontWeight.w700 : FontWeight.w500,
              color: aktif ? scheme.primary : scheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
