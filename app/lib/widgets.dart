import 'package:flutter/material.dart';

import 'theme.dart';

/// Avatar bulat berwarna dengan inisial nama + titik status online.
class Avatar extends StatelessWidget {
  const Avatar({
    super.key,
    required this.name,
    this.size = 44,
    this.online,
    this.ring = false,
  });

  final String name;
  final double size;

  /// null = titik status tidak ditampilkan.
  final bool? online;

  /// Beri cincin putih (untuk avatar yang menempel di latar ramai).
  final bool ring;

  String get inisial {
    final t = name.trim();
    if (t.isEmpty) return '?';
    final bagian = t
        .split(RegExp(r'[^A-Za-z0-9]+'))
        .where((e) => e.isNotEmpty)
        .toList();
    if (bagian.length >= 2) return (bagian[0][0] + bagian[1][0]).toUpperCase();
    final kata = bagian.isEmpty ? t : bagian.first;
    return (kata.length >= 2 ? kata.substring(0, 2) : kata).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final warna = avatarColorFor(name);
    final bulat = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [warna, Color.lerp(warna, Colors.black, 0.28)!],
        ),
        shape: BoxShape.circle,
        border: ring
            ? Border.all(color: AppColors.surface(context), width: size * 0.075)
            : null,
      ),
      child: Text(
        inisial,
        style: TextStyle(
          color: onAvatarColor(warna),
          fontWeight: FontWeight.w700,
          fontSize: size * 0.38,
          height: 1,
          letterSpacing: 0.2,
        ),
      ),
    );

    if (online == null) return bulat;

    final titik = size * 0.29;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        bulat,
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: titik,
            height: titik,
            decoration: BoxDecoration(
              color: online! ? AppColors.online : AppColors.offline,
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.surface(context),
                width: (titik * 0.22).clamp(1.5, 3),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Titik kecil penanda status (online/offline).
class StatusDot extends StatelessWidget {
  const StatusDot({super.key, required this.color, this.size = 10});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.45), blurRadius: 6, spreadRadius: 1),
        ],
      ),
    );
  }
}

/// Tiga titik beranimasi: penanda "sedang mengetik".
class TypingDots extends StatefulWidget {
  const TypingDots({super.key, this.color});

  final Color? color;

  @override
  State<TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _opasitas(int i) {
    final fase = (_c.value + i * 0.18) % 1.0;
    final segitiga = fase < 0.5 ? fase * 2 : (1 - fase) * 2;
    return 0.3 + 0.7 * segitiga;
  }

  @override
  Widget build(BuildContext context) {
    final warna = widget.color ?? Theme.of(context).colorScheme.onSurfaceVariant;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Opacity(
                opacity: _opasitas(i),
                child: Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(color: warna, shape: BoxShape.circle),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Kartu putih membulat dengan bayangan halus.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.onTap,
    this.radius = 18,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final gelap = Theme.of(context).brightness == Brightness.dark;
    final isi = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.surface(context),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AppColors.hairline(context)),
        boxShadow: gelap
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
              ],
      ),
      child: child,
    );

    final berkotak = onTap == null
        ? isi
        : Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(radius),
              child: isi,
            ),
          );

    return margin == null ? berkotak : Padding(padding: margin!, child: berkotak);
  }
}

/// Judul kecil di atas kelompok pengaturan.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 22, 6, 8),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.9,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

/// Tampilan saat belum ada isi (belum ada pesan/pengguna).
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle});

  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: scheme.primaryContainer.withValues(alpha: 0.55),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 42, color: scheme.primary),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant, height: 1.45),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
