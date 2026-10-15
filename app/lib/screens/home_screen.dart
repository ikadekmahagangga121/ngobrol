import 'package:flutter/material.dart';

import '../chat_service.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'chat_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  final Session session;
  final ChatService chat;

  const HomeScreen({super.key, required this.session, required this.chat});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  static const _judul = ['Obrolan Grup', 'Teman', 'Pengaturan'];

  @override
  Widget build(BuildContext context) {
    final chat = widget.chat;
    return ListenableBuilder(
      listenable: chat,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            backgroundColor: AppColors.surface(context),
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            titleSpacing: 0,
            leadingWidth: 64,
            leading: Padding(
              padding: const EdgeInsets.only(left: 14),
              child: Avatar(
                name: widget.session.username ?? '?',
                size: 38,
                online: chat.status == ConnStatus.connected,
              ),
            ),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_judul[_tab],
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                _StatusBaris(chat: chat),
              ],
            ),
            actions: [
              if (_tab == 1)
                IconButton(
                  tooltip: 'Muat ulang daftar',
                  icon: const Icon(Icons.refresh_rounded),
                  onPressed: chat.refreshUsers,
                ),
              const SizedBox(width: 6),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Container(height: 1, color: AppColors.hairline(context)),
            ),
          ),
          body: IndexedStack(
            index: _tab,
            children: [
              ChatScreen(
                chat: chat,
                session: widget.session,
                peerId: null,
                embedded: true,
              ),
              _UsersTab(
                chat: chat,
                session: widget.session,
                onOpen: _bukaChat,
              ),
              SettingsScreen(session: widget.session, chat: chat),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              const NavigationDestination(
                  icon: Icon(Icons.forum_outlined),
                  selectedIcon: Icon(Icons.forum_rounded),
                  label: 'Grup'),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: chat.totalUnread > 0,
                  label: Text('${chat.totalUnread}'),
                  child: const Icon(Icons.people_outline_rounded),
                ),
                selectedIcon: const Icon(Icons.people_rounded),
                label: 'Teman',
              ),
              const NavigationDestination(
                  icon: Icon(Icons.settings_outlined),
                  selectedIcon: Icon(Icons.settings_rounded),
                  label: 'Atur'),
            ],
          ),
        );
      },
    );
  }

  void _bukaChat(ChatUser u) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChatScreen(
        chat: widget.chat,
        session: widget.session,
        peerId: u.id,
      ),
    ));
  }
}

/// Baris status koneksi (titik warna + keterangan) di bawah judul.
class _StatusBaris extends StatelessWidget {
  const _StatusBaris({required this.chat});

  final ChatService chat;

  @override
  Widget build(BuildContext context) {
    final (warna, teks) = switch (chat.status) {
      ConnStatus.connected => (AppColors.online, 'Terhubung'),
      ConnStatus.connecting => (AppColors.warning, 'Menyambungkan...'),
      ConnStatus.offline => (AppColors.danger, 'Terputus — mencoba ulang...'),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        StatusDot(color: warna, size: 7),
        const SizedBox(width: 6),
        Text(
          teks,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w500,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// Tab daftar pengguna: pencarian + kelompok Online/Offline.
class _UsersTab extends StatefulWidget {
  final ChatService chat;
  final Session session;
  final void Function(ChatUser user) onOpen;

  const _UsersTab({required this.chat, required this.session, required this.onOpen});

  @override
  State<_UsersTab> createState() => _UsersTabState();
}

class _UsersTabState extends State<_UsersTab> {
  final _cari = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chat = widget.chat;
    return ListenableBuilder(
      listenable: chat,
      builder: (context, _) {
        final me = widget.session.userId;
        final semua = chat.users.where((u) => u.id != me).toList()
          ..sort((a, b) {
            if (a.online != b.online) return a.online ? -1 : 1;
            return a.username.toLowerCase().compareTo(b.username.toLowerCase());
          });
        final q = _q.trim().toLowerCase();
        final tampil = q.isEmpty
            ? semua
            : semua.where((u) => u.username.toLowerCase().contains(q)).toList();
        final online = tampil.where((u) => u.online).toList();
        final offline = tampil.where((u) => !u.online).toList();

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
              child: TextField(
                controller: _cari,
                onChanged: (v) => setState(() => _q = v),
                decoration: InputDecoration(
                  hintText: 'Cari teman...',
                  prefixIcon: const Icon(Icons.search_rounded, size: 20),
                  suffixIcon: _q.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Hapus',
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: () {
                            _cari.clear();
                            setState(() => _q = '');
                          },
                        ),
                  filled: true,
                  fillColor: AppColors.fill(context),
                  contentPadding: const EdgeInsets.symmetric(vertical: 13),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none),
                  enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(color: AppColors.hairline(context))),
                  focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          BorderSide(color: Theme.of(context).colorScheme.primary, width: 1.6)),
                ),
              ),
            ),
            Expanded(child: _isi(context, chat, semua, tampil, online, offline)),
          ],
        );
      },
    );
  }

  Widget _isi(
    BuildContext context,
    ChatService chat,
    List<ChatUser> semua,
    List<ChatUser> tampil,
    List<ChatUser> online,
    List<ChatUser> offline,
  ) {
    if (semua.isEmpty) {
      return const EmptyState(
        icon: Icons.groups_rounded,
        title: 'Belum ada teman lain',
        subtitle: 'Minta temanmu memasang aplikasi ini lalu mendaftar.\n'
            'Namanya akan muncul di sini, dan kamu bisa chat berdua.',
      );
    }
    if (tampil.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_rounded,
        title: 'Tidak ditemukan',
        subtitle: 'Tidak ada teman bernama "$_q".',
      );
    }

    final anak = <Widget>[];
    if (online.isNotEmpty) {
      anak.add(_label(context, 'Sedang online', online.length));
      anak.addAll(online.map((u) => _kartu(context, chat, u)));
    }
    if (offline.isNotEmpty) {
      anak.add(_label(context, 'Lagi tidak online', offline.length));
      anak.addAll(offline.map((u) => _kartu(context, chat, u)));
    }

    return RefreshIndicator(
      onRefresh: chat.refreshUsers,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 24),
        children: anak,
      ),
    );
  }

  Widget _label(BuildContext context, String judul, int jumlah) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 8),
      child: Text(
        '$judul — $jumlah',
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }

  Widget _kartu(BuildContext context, ChatService chat, ChatUser u) {
    final tema = Theme.of(context).colorScheme;
    final unread = chat.unread[u.id] ?? 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        radius: 16,
        onTap: () => widget.onOpen(u),
        child: Row(
          children: [
            Avatar(name: u.username, size: 46, online: u.online),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(u.username,
                      style: const TextStyle(
                          fontSize: 15.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text(
                    u.online ? 'Online' : 'Offline',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: u.online ? FontWeight.w600 : FontWeight.w400,
                      color: u.online ? AppColors.online : tema.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (unread > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: tema.primary,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('$unread',
                    style: TextStyle(
                        color: tema.onPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700)),
              )
            else
              Icon(Icons.chevron_right_rounded, color: tema.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}
