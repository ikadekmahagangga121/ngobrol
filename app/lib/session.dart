import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Status login + alamat server, disimpan antar sesi (aplikasi dibuka lagi).
class Session extends ChangeNotifier {
  String? token;
  int? userId;
  String? username;
  String serverUrl = 'http://10.0.2.2:8080'; // 10.0.2.2 = PC host (emulator)
  bool ready = false;

  static const _kToken = 'token';
  static const _kUserId = 'userId';
  static const _kUsername = 'username';
  static const _kServer = 'serverUrl';

  bool get loggedIn => token != null;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    serverUrl = prefs.getString(_kServer) ?? serverUrl;
    token = prefs.getString(_kToken);
    userId = prefs.getInt(_kUserId);
    username = prefs.getString(_kUsername);
    ready = true;
    notifyListeners();
  }

  Future<void> setServerUrl(String url) async {
    var u = url.trim();
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    serverUrl = u;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kServer, u);
    notifyListeners();
  }

  Future<void> signIn({
    required String token,
    required int userId,
    required String username,
  }) async {
    this.token = token;
    this.userId = userId;
    this.username = username;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, token);
    await prefs.setInt(_kUserId, userId);
    await prefs.setString(_kUsername, username);
    notifyListeners();
  }

  /// Ganti kata sandi. Pesan kesalahan dari server dilempar sebagai Exception.
  /// Demi keamanan, semua perangkat lain yang masih masuk akan otomatis keluar.
  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    final res = await http
        .post(
          Uri.parse('$serverUrl/api/change-password'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'oldPassword': oldPassword,
            'newPassword': newPassword,
          }),
        )
        .timeout(const Duration(seconds: 30));
    if (res.statusCode == 200) return;

    var pesan = 'Gagal mengganti kata sandi. Coba lagi.';
    try {
      final data = jsonDecode(res.body);
      if (data is Map && data['error'] is String) pesan = data['error'] as String;
    } catch (_) {}
    throw Exception(pesan);
  }

  Future<void> signOut() async {
    final t = token;
    final server = serverUrl;
    token = null;
    userId = null;
    username = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kUserId);
    await prefs.remove(_kUsername);
    notifyListeners();
    // Beri tahu server agar token ini dihapus (kalau gagal, tidak masalah).
    if (t != null) {
      try {
        await http
            .post(Uri.parse('$server/api/logout'),
                headers: {'Authorization': 'Bearer $t'})
            .timeout(const Duration(seconds: 5));
      } catch (_) {}
    }
  }
}
