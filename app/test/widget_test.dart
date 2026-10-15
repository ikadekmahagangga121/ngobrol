import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ngobrol/chat_service.dart';
import 'package:ngobrol/models.dart';
import 'package:ngobrol/screens/home_screen.dart';
import 'package:ngobrol/screens/login_screen.dart';
import 'package:ngobrol/session.dart';
import 'package:ngobrol/theme.dart';
import 'package:ngobrol/widgets.dart';

void main() {
  testWidgets('Halaman masuk: sederhana dan mudah dipahami pemula', (tester) async {
    final session = Session();
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.build(Brightness.light),
      home: LoginScreen(session: session),
    ));

    expect(find.text('Ngobrol'), findsOneWidget);
    expect(find.text('Masuk'), findsOneWidget); // sakelar Masuk / Daftar
    expect(find.text('Masuk Sekarang'), findsOneWidget); // tombol utama
    expect(find.text('Nama pengguna'), findsOneWidget);
    expect(find.text('Kata sandi'), findsOneWidget);

    // Kolom teknis tersembunyi agar tidak membingungkan pemula.
    expect(find.text('Alamat server'), findsOneWidget);

    // Ketuk untuk membukanya.
    await tester.tap(find.text('Alamat server'));
    await tester.pumpAndSettle();
    expect(find.text('Simpan alamat'), findsOneWidget);
    expect(find.byType(TextField), findsWidgets);
  });

  testWidgets('Beranda tampil tanpa error (3 tab)', (tester) async {
    final session = Session();
    final chat = ChatService(session);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.build(Brightness.light),
      home: HomeScreen(session: session, chat: chat),
    ));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Grup'), findsOneWidget);
    expect(find.text('Teman'), findsOneWidget);
    expect(find.text('Atur'), findsOneWidget);
  });

  test('Inisial avatar dibuat dari nama', () {
    expect(const Avatar(name: 'budi').inisial, 'BU');
    expect(const Avatar(name: 'budi_santoso').inisial, 'BS');
    expect(const Avatar(name: 'a').inisial, 'A');
    expect(const Avatar(name: '').inisial, '?');
  });

  test('Format jam dua digit', () {
    expect(jam(DateTime(2026, 1, 1, 9, 5)), '09:05');
    expect(jam(DateTime(2026, 1, 1, 21, 30)), '21:30');
  });

  test('Pesan yang diketik saat belum tersambung tidak hilang', () {
    final chat = ChatService(Session());
    // Belum tersambung (status awal: menyambung) → pesan harus ditahan.
    expect(chat.outboxCount, 0);

    chat.sendGroup('halo grup');
    chat.sendPm(7, 'halo kamu');
    expect(chat.outboxCount, 2, reason: 'pesan disimpan untuk dikirim nanti');

    // Indikator sedang mengetik tidak ikut ditahan (hanya pesan asli).
    chat.sendTyping(peer: 7);
    expect(chat.outboxCount, 2);

    // Menutup sesi membersihkan antrean.
    chat.dispose();
  });
}
