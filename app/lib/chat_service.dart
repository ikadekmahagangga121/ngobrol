import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'models.dart';
import 'session.dart';

enum ConnStatus { connecting, connected, offline }

/// Pengelola koneksi WebSocket + penyimpan pesan di memori.
/// Dipakai bersama oleh semua layar (room grup & private message).
class ChatService extends ChangeNotifier {
  ChatService(this._session);

  final Session _session;

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _retryTimer;
  bool _disposed = false;
  int _retryDelay = 1;
  String? _lastError;

  ConnStatus status = ConnStatus.connecting;
  final List<ChatUser> users = [];
  final List<ChatMessage> groupMessages = [];
  final Map<int, List<ChatMessage>> _private = {};
  final Map<int, int> unread = {}; // peerId -> pesan belum dibaca
  final Map<int, DateTime> _typingUntil = {};
  final Map<int, String> _typingNames = {};
  final Set<int> _historyLoaded = {}; // peerId (null grup = -1) yang sudah diambil
  final List<Map<String, dynamic>> _outbox = []; // pesan menunggu koneksi
  static const _maksPerKirim = 10; // pesan per gelombang saat menyusul koneksi
  Timer? _outboxTimer;

  int? get _me => _session.userId;

  String? get lastError => _lastError;

  // ---------------------------------------------------------------- koneksi

  /// Panggil saat token/serverUrl berubah.
  void onSessionChanged() {
    if (_session.token == null) {
      disconnect();
      users.clear();
      groupMessages.clear();
      _private.clear();
      unread.clear();
      _outbox.clear();
      _outboxTimer?.cancel();
      notifyListeners();
      return;
    }
    connect();
  }

  void connect() {
    final token = _session.token;
    if (token == null) return;
    _retryTimer?.cancel();
    _sub?.cancel();
    _channel?.sink.close();

    status = ConnStatus.connecting;
    _lastError = null;
    notifyListeners();

    final wsUrl =
        '${_session.serverUrl.replaceFirst('http', 'ws')}/ws?token=$token';
    try {
      final ch = WebSocketChannel.connect(Uri.parse(wsUrl));
      _channel = ch;
      _sub = ch.stream.listen(
        _onData,
        onError: (Object _) => _onClosed(),
        onDone: _onClosed,
        cancelOnError: true,
      );
    } catch (e) {
      _lastError = e.toString();
      _onClosed();
    }
  }

  void disconnect() {
    _retryTimer?.cancel();
    _outboxTimer?.cancel();
    _sub?.cancel();
    _sub = null;
    _channel?.sink.close();
    _channel = null;
    status = ConnStatus.offline;
  }

  void _onClosed() {
    if (_disposed) return;
    _sub?.cancel();
    _sub = null;
    _channel = null;
    status = ConnStatus.offline;
    notifyListeners();
    // Coba sambung ulang: 1s, 2s, 4s, ... maks 15s
    _retryTimer?.cancel();
    _retryTimer = Timer(Duration(seconds: _retryDelay), connect);
    _retryDelay = (_retryDelay * 2).clamp(1, 15);
  }

  void _onData(dynamic raw) {
    Map<String, dynamic> m;
    try {
      m = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    switch (m['type']) {
      case 'hello':
        status = ConnStatus.connected;
        _retryDelay = 1;
        _lastError = null;
        users
          ..clear()
          ..addAll(((m['users'] as List?) ?? [])
              .map((u) => ChatUser.fromJson(u as Map<String, dynamic>)));
        _flushOutbox(); // kirim pesan yang tadi menunggu koneksi
        break;
      case 'group':
        _addMessage(groupMessages, ChatMessage.fromJson(m));
        break;
      case 'pm':
        final msg = ChatMessage.fromJson(m);
        final peer = msg.from.id == _me ? msg.to! : msg.from.id;
        final list = _private.putIfAbsent(peer, () => []);
        _addMessage(list, msg);
        if (msg.from.id != _me) {
          unread[peer] = (unread[peer] ?? 0) + 1;
        }
        break;
      case 'presence':
        final u = m['user'] as Map<String, dynamic>;
        final id = u['id'] as int;
        final idx = users.indexWhere((x) => x.id == id);
        final online = m['status'] == 'online';
        if (idx >= 0) {
          users[idx] = ChatUser(id: id, username: u['username'] as String, online: online);
        } else {
          users.add(ChatUser(id: id, username: u['username'] as String, online: online));
          users.sort((a, b) => a.username.toLowerCase().compareTo(b.username.toLowerCase()));
        }
        break;
      case 'typing':
        final from = m['from'] as Map<String, dynamic>;
        final id = from['id'] as int;
        if (id != _me) {
          _typingNames[id] = from['username'] as String;
          _typingUntil[id] = DateTime.now().add(const Duration(seconds: 4));
        }
        break;
      case 'error':
        _lastError = m['error'] as String?;
        break;
    }
    notifyListeners();
  }

  void _addMessage(List<ChatMessage> list, ChatMessage msg) {
    if (list.any((m) => m.id == msg.id)) return;
    list.add(msg);
    list.sort((a, b) => a.at.compareTo(b.at));
  }

  // ---------------------------------------------------------------- kirim

  /// Pesan yang belum terkirim karena koneksi sedang putus.
  int get outboxCount => _outbox.length;

  void _send(Map<String, dynamic> payload, {bool simpan = false}) {
    final ch = _channel;
    if (ch != null && status == ConnStatus.connected) {
      try {
        ch.sink.add(jsonEncode(payload));
        return;
      } catch (_) {
        // Kanal ternyata sudah tertutup — simpan dan kirim saat tersambung lagi.
      }
    }
    // Koneksi putus: jangan buang pesannya — kirim otomatis saat tersambung lagi.
    if (!simpan) return;
    _outbox.add(payload);
    notifyListeners();
  }

  /// Kirim semua pesan yang menunggu (dipanggil setelah tersambung kembali).
  ///
  /// Dikirim bertahap (maksimal 10 tiap 5 detik) supaya tidak kena batas
  /// anti-spam server — kalau dikirim sekaligus, sebagian bisa ditolak & hilang.
  void _flushOutbox() {
    final ch = _channel;
    if (ch == null || status != ConnStatus.connected || _outbox.isEmpty) return;
    final jumlah = _outbox.length < _maksPerKirim ? _outbox.length : _maksPerKirim;
    try {
      for (var i = 0; i < jumlah; i++) {
        final pesan = _outbox.first;
        ch.sink.add(jsonEncode(pesan));
        _outbox.removeAt(0); // baru dibuang setelah benar-benar terkirim
      }
    } catch (_) {
      // Koneksi putus lagi di tengah jalan — sisanya menunggu sambungan berikutnya.
    }
    notifyListeners();
    if (_outbox.isNotEmpty) {
      _outboxTimer?.cancel();
      _outboxTimer = Timer(const Duration(seconds: 5), _flushOutbox);
    }
  }

  void sendGroup(String text) =>
      _send({'type': 'group', 'text': text}, simpan: true);

  void sendPm(int to, String text) =>
      _send({'type': 'pm', 'to': to, 'text': text}, simpan: true);

  void sendTyping({int? peer}) => _send({'type': 'typing', 'to': peer});

  // ---------------------------------------------------------------- data

  List<ChatMessage> messagesFor(int? peerId) =>
      peerId == null ? groupMessages : _private.putIfAbsent(peerId, () => []);

  List<String> typingNamesNow({int? peerId}) {
    final now = DateTime.now();
    return [
      for (final e in _typingUntil.entries)
        if (now.isBefore(e.value) && (peerId == null || e.key == peerId))
          _typingNames[e.key] ?? '?',
    ];
  }

  void markRead(int? peerId) {
    if (peerId == null) return;
    if (unread.remove(peerId) != null) notifyListeners();
  }

  int get totalUnread => unread.values.fold(0, (a, b) => a + b);

  ChatUser? userById(int id) {
    for (final u in users) {
      if (u.id == id) return u;
    }
    return null;
  }

  bool get historyLoaded => _historyLoaded.contains(-1);

  /// Ambil riwayat chat dari server (per grup / per user).
  Future<void> loadHistory(int? peerId) async {
    final token = _session.token;
    if (token == null) return;
    final key = peerId ?? -1;
    if (_historyLoaded.contains(key)) return;
    _historyLoaded.add(key);

    final url = peerId == null
        ? '${_session.serverUrl}/api/messages'
        : '${_session.serverUrl}/api/messages?with=$peerId';
    try {
      final res = await http.get(
        Uri.parse(url),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final list = messagesFor(peerId);
      for (final raw in (data['messages'] as List)) {
        _addMessage(list, ChatMessage.fromJson(raw as Map<String, dynamic>));
      }
      notifyListeners();
    } catch (_) {
      _historyLoaded.remove(key); // biar bisa dicoba lagi
    }
  }

  Future<void> refreshUsers() async {
    final token = _session.token;
    if (token == null) return;
    try {
      final res = await http.get(
        Uri.parse('${_session.serverUrl}/api/users'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      users
        ..clear()
        ..addAll(((data['users'] as List?) ?? [])
            .map((u) => ChatUser.fromJson(u as Map<String, dynamic>)));
      notifyListeners();
    } catch (_) {}
  }

  @override
  void dispose() {
    _disposed = true;
    disconnect();
    super.dispose();
  }
}
