class ChatUser {
  final int id;
  final String username;
  final bool online;

  const ChatUser({
    required this.id,
    required this.username,
    this.online = false,
  });

  factory ChatUser.fromJson(Map<String, dynamic> j) => ChatUser(
        id: j['id'] as int,
        username: j['username'] as String,
        online: j['online'] as bool? ?? false,
      );
}

class ChatMessage {
  final int id;
  final ChatUser from;
  final int? to; // null = pesan room grup
  final String text;
  final DateTime at;

  const ChatMessage({
    required this.id,
    required this.from,
    required this.to,
    required this.text,
    required this.at,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'] as int,
        from: ChatUser.fromJson(j['from'] as Map<String, dynamic>),
        to: j['to'] as int?,
        text: j['text'] as String,
        at: DateTime.fromMillisecondsSinceEpoch(j['at'] as int),
      );
}

String jam(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
