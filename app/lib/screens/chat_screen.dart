import 'package:flutter/material.dart';

import '../chat_service.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Layar percakapan — dipakai untuk room grup (peerId == null)
/// dan private message (peerId != null).
///
/// [embedded] = true kalau dipakai sebagai tab (sudah ada AppBar dari beranda).
class ChatScreen extends StatefulWidget {
  final ChatService chat;
  final Session session;
  final int? peerId;
  final bool embedded;

  const ChatScreen({
    super.key,
    required this.chat,
    required this.session,
    required this.peerId,
    this.embedded = false,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _textCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  DateTime? _lastTypingSent;
  bool _diBawah = true;

  ChatService get chat => widget.chat;
  int? get peerId => widget.peerId;

  @override
  void initState() {
    super.initState();
    chat.loadHistory(peerId);
    chat.markRead(peerId);
    chat.addListener(_onChatChanged);
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    chat.removeListener(_onChatChanged);
    _scrollCtrl.removeListener(_onScroll);
    _textCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollCtrl.hasClients) return;
    final p = _scrollCtrl.position;
    final diBawah = p.pixels >= p.maxScrollExtent - 90;
    if (diBawah != _diBawah) setState(() => _diBawah = diBawah);
  }

  void _onChatChanged() {
    if (!mounted) return;
    chat.markRead(peerId);
    // Ikuti pesan baru hanya kalau pembaca sedang di bagian bawah.
    if (_diBawah) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollCtrl.hasClients) return;
        _scrollCtrl.jumpTo(_scrollCtrl.position.maxScrollExtent);
      });
    }
  }

  void _send() {
    final text = _textCtrl.text.trim();
    if (text.isEmpty) return;
    if (peerId == null) {
      chat.sendGroup(text);
    } else {
      chat.sendPm(peerId!, text);
    }
    _textCtrl.clear();
    _diBawah = true;
  }

  void _onChanged(String value) {
    final now = DateTime.now();
    if (_lastTypingSent == null ||
        now.difference(_lastTypingSent!) > const Duration(seconds: 2)) {
      _lastTypingSent = now;
      chat.sendTyping(peer: peerId);
    }
  }

  void _keBawah() {
    if (!_scrollCtrl.hasClients) return;
    _scrollCtrl.animateTo(
      _scrollCtrl.position.maxScrollExtent,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: chat,
      builder: (context, _) => _build(context),
    );
  }

  Widget _build(BuildContext context) {
    final isi = Column(
      children: [
        Expanded(
          child: Stack(
            children: [
              _daftarPesan(context),
              Positioned(
                right: 14,
                bottom: 12,
                child: AnimatedScale(
                  scale: _diBawah ? 0 : 1,
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  child: AnimatedOpacity(
                    opacity: _diBawah ? 0 : 1,
                    duration: const Duration(milliseconds: 180),
                    child: Material(
                      color: AppColors.surface(context),
                      shape: const CircleBorder(),
                      elevation: 3,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _keBawah,
                        child: const Padding(
                          padding: EdgeInsets.all(9),
                          child: Icon(Icons.keyboard_arrow_down_rounded, size: 24),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        _sedangMengetik(context),
        _bilahKoneksi(context),
        _kotakTulis(context),
      ],
    );

    if (widget.embedded) return isi;

    final peer = peerId == null ? null : chat.userById(peerId!);
    final tema = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.surface(context),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        titleSpacing: 0,
        title: Row(
          children: [
            Avatar(name: peer?.username ?? 'Grup', size: 38, online: peer?.online),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(peer?.username ?? 'Grup',
                    style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  peer == null ? '' : (peer.online ? 'Online' : 'Offline'),
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: peer?.online == true ? AppColors.online : tema.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.hairline(context)),
        ),
      ),
      body: isi,
    );
  }

  // ------------------------------------------------------------- isi pesan

  Widget _daftarPesan(BuildContext context) {
    final messages = chat.messagesFor(peerId);
    if (messages.isEmpty) {
      return EmptyState(
        icon: peerId == null ? Icons.forum_outlined : Icons.mark_chat_unread_outlined,
        title: 'Belum ada pesan',
        subtitle: peerId == null
            ? 'Tulis pesan di kotak bawah.\nSemua orang di grup ini akan membacanya.'
            : 'Tulis pesan di kotak bawah untuk mulai ngobrol berdua.',
      );
    }

    final baris = _susunBaris(messages);
    return ListView.builder(
      controller: _scrollCtrl,
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 14),
      itemCount: baris.length,
      itemBuilder: (context, i) {
        final b = baris[i];
        if (b.hari != null) return _pemisahHari(context, b.hari!);
        return _bubble(context, b);
      },
    );
  }

  List<_Baris> _susunBaris(List<ChatMessage> pesan) {
    final hasil = <_Baris>[];
    for (var i = 0; i < pesan.length; i++) {
      final m = pesan[i];
      final sebelum = i > 0 ? pesan[i - 1] : null;
      final sesudah = i + 1 < pesan.length ? pesan[i + 1] : null;

      final hariBaru = sebelum == null || !_hariSama(sebelum.at, m.at);
      final lanjutan = sebelum != null &&
          !hariBaru &&
          sebelum.from.id == m.from.id &&
          m.at.difference(sebelum.at).inMinutes < 5;
      final terakhir = sesudah == null ||
          !_hariSama(m.at, sesudah.at) ||
          sesudah.from.id != m.from.id ||
          sesudah.at.difference(m.at).inMinutes >= 5;

      hasil.add(_Baris(
        msg: m,
        hari: hariBaru ? m.at : null,
        pertama: !lanjutan,
        terakhir: terakhir,
      ));
    }
    return hasil;
  }

  Widget _bubble(BuildContext context, _Baris b) {
    final msg = b.msg;
    final punyaku = msg.from.id == widget.session.userId;
    final grup = peerId == null;
    final pakaiAvatar = grup && !punyaku;

    return Padding(
      padding: EdgeInsets.only(top: b.pertama ? 8 : 2),
      child: Row(
        mainAxisAlignment: punyaku ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (pakaiAvatar)
            SizedBox(
              width: 34,
              child: b.pertama
                  ? Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Avatar(name: msg.from.username, size: 28),
                    )
                  : null,
            ),
          Flexible(
            child: _Bubble(
              msg: msg,
              mine: punyaku,
              senderName: grup && !punyaku && b.pertama ? msg.from.username : null,
              ekor: b.terakhir,
            ),
          ),
        ],
      ),
    );
  }

  Widget _pemisahHari(BuildContext context, DateTime t) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: AppColors.fill(context),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.hairline(context)),
          ),
          child: Text(
            _labelHari(t),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------- potongan UI

  Widget _sedangMengetik(BuildContext context) {
    final nama = chat.typingNamesNow(peerId: peerId);
    if (nama.isEmpty) return const SizedBox.shrink();
    final ringkas = nama.length <= 2 ? nama.join(', ') : '${nama.length} orang';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
      child: Row(
        children: [
          TypingDots(color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              '$ringkas sedang mengetik…',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                fontStyle: FontStyle.italic,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bilahKoneksi(BuildContext context) {
    final menunggu = chat.outboxCount;
    if (chat.status == ConnStatus.connected && menunggu == 0) {
      return const SizedBox.shrink();
    }
    final tema = Theme.of(context).colorScheme;
    final dasar = chat.status == ConnStatus.connecting
        ? 'Menyambungkan…'
        : chat.status == ConnStatus.connected
            ? 'Mengirim pesan…'
            : 'Tidak bisa menyambung. Mencoba lagi…';
    final teks = menunggu > 0
        ? '$dasar ${menunggu == 1 ? '1 pesan' : '$menunggu pesan'} akan terkirim otomatis.'
        : dasar;
    return Container(
      width: double.infinity,
      color: tema.errorContainer.withValues(alpha: 0.6),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 13,
            height: 13,
            child: CircularProgressIndicator(strokeWidth: 2, color: tema.onErrorContainer),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              teks,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                color: tema.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kotakTulis(BuildContext context) {
    final tema = Theme.of(context).colorScheme;
    final peer = peerId == null ? null : chat.userById(peerId!);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface(context),
        border: Border(top: BorderSide(color: AppColors.hairline(context))),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.fill(context),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.hairline(context)),
                  ),
                  child: TextField(
                    controller: _textCtrl,
                    onChanged: _onChanged,
                    minLines: 1,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    style: const TextStyle(fontSize: 15.5),
                    decoration: InputDecoration(
                      hintText: peer == null
                          ? 'Tulis pesan…'
                          : 'Tulis pesan untuk ${peer.username}…',
                      hintStyle: TextStyle(
                        fontSize: 15,
                        color: tema.onSurfaceVariant.withValues(alpha: 0.8),
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: _textCtrl,
                builder: (context, nilai, _) {
                  final ada = nilai.text.trim().isNotEmpty;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    decoration: BoxDecoration(
                      color: ada ? tema.primary : AppColors.fill(context),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      tooltip: 'Kirim',
                      onPressed: ada ? _send : null,
                      icon: Icon(
                        Icons.arrow_upward_rounded,
                        size: 22,
                        color: ada ? tema.onPrimary : tema.onSurfaceVariant,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Satu baris daftar pesan (bisa berupa pemisah hari atau gelembung).
class _Baris {
  const _Baris({
    required this.msg,
    required this.hari,
    required this.pertama,
    required this.terakhir,
  });

  final ChatMessage msg;
  final DateTime? hari;
  final bool pertama;
  final bool terakhir;
}

bool _hariSama(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String _labelHari(DateTime t) {
  final now = DateTime.now();
  final hari = DateTime(t.year, t.month, t.day);
  final hariIni = DateTime(now.year, now.month, now.day);
  final beda = hariIni.difference(hari).inDays;
  if (beda == 0) return 'Hari ini';
  if (beda == 1) return 'Kemarin';
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  final tahun = t.year == now.year ? '' : ' ${t.year}';
  return '${t.day} ${bulan[t.month - 1]}$tahun';
}

/// Gelembung pesan.
class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.msg,
    required this.mine,
    this.senderName,
    this.ekor = true,
  });

  final ChatMessage msg;
  final bool mine;
  final String? senderName;
  final bool ekor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final gelap = Theme.of(context).brightness == Brightness.dark;
    final warnaDasar = mine ? scheme.primary : AppColors.bubbleIn(context);
    final warnaTeks = mine ? scheme.onPrimary : scheme.onSurface;
    const besar = Radius.circular(18);
    const kecil = Radius.circular(6);

    return Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.74),
      padding: const EdgeInsets.fromLTRB(13, 9, 13, 8),
      decoration: BoxDecoration(
        color: warnaDasar,
        borderRadius: BorderRadius.only(
          topLeft: besar,
          topRight: besar,
          bottomLeft: mine ? besar : (ekor ? kecil : besar),
          bottomRight: mine ? (ekor ? kecil : besar) : besar,
        ),
        border: mine ? null : Border.all(color: AppColors.hairline(context)),
        boxShadow: (gelap || mine)
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (senderName != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(
                senderName!,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: avatarColorFor(senderName!),
                ),
              ),
            ),
          Text(msg.text, style: TextStyle(fontSize: 15.5, height: 1.3, color: warnaTeks)),
          const SizedBox(height: 3),
          Align(
            alignment: Alignment.bottomRight,
            child: Text(
              jam(msg.at),
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w500,
                color: warnaTeks.withValues(alpha: 0.6),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
