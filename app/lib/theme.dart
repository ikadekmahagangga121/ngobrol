import 'package:flutter/material.dart';

/// Tema & identitas visual aplikasi Ngobrol.
class AppTheme {
  AppTheme._();

  /// Warna utama: ungu-biru yang ramah.
  static const Color seed = Color(0xFF6C5CE7);

  static ThemeData build(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(seedColor: seed, brightness: brightness);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.backgroundBrightness(brightness),
    );
  }
}

/// Warna-warna dasar aplikasi (aman untuk mode terang & gelap).
class AppColors {
  AppColors._();

  static Color background(BuildContext c) => backgroundBrightness(Theme.of(c).brightness);
  static Color backgroundBrightness(Brightness b) =>
      b == Brightness.dark ? const Color(0xFF0E0F16) : const Color(0xFFF3F4FA);

  /// Permukaan kartu / app bar.
  static Color surface(BuildContext c) =>
      Theme.of(c).brightness == Brightness.dark ? const Color(0xFF171922) : Colors.white;

  /// Isian kolom input & elemen lembut lainnya.
  static Color fill(BuildContext c) =>
      Theme.of(c).brightness == Brightness.dark ? const Color(0xFF23252F) : const Color(0xFFF1F2F8);

  /// Gelembung pesan masuk.
  static Color bubbleIn(BuildContext c) =>
      Theme.of(c).brightness == Brightness.dark ? const Color(0xFF23252F) : Colors.white;

  /// Garis tipis pemisah.
  static Color hairline(BuildContext c) =>
      Theme.of(c).colorScheme.outlineVariant.withValues(alpha: 0.55);

  static const Color online = Color(0xFF22C55E);
  static const Color offline = Color(0xFF9CA3AF);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
}

/// Palet warna avatar (dipilih stabil dari nama).
const List<Color> kAvatarPalette = [
  Color(0xFF6C5CE7),
  Color(0xFF0984E3),
  Color(0xFF00B894),
  Color(0xFFE17055),
  Color(0xFFD63031),
  Color(0xFF00CEC9),
  Color(0xFFE84393),
  Color(0xFF8E44AD),
];

int _stableHash(String s) {
  var h = 0;
  for (final c in s.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return h;
}

Color avatarColorFor(String name) =>
    kAvatarPalette[_stableHash(name.trim().toLowerCase()) % kAvatarPalette.length];

Color onAvatarColor(Color c) =>
    c.computeLuminance() > 0.6 ? Colors.black87 : Colors.white;
