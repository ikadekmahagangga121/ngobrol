import 'package:flutter/material.dart';

import 'chat_service.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'session.dart';
import 'theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session();
  await session.load();
  final chat = ChatService(session);
  session.addListener(chat.onSessionChanged);
  chat.onSessionChanged();
  runApp(NgobrolApp(session: session, chat: chat));
}

class NgobrolApp extends StatelessWidget {
  final Session session;
  final ChatService chat;

  const NgobrolApp({super.key, required this.session, required this.chat});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        return MaterialApp(
          title: 'Ngobrol',
          debugShowCheckedModeBanner: false,
          themeMode: ThemeMode.system,
          theme: AppTheme.build(Brightness.light),
          darkTheme: AppTheme.build(Brightness.dark),
          home: session.loggedIn
              ? HomeScreen(session: session, chat: chat)
              : LoginScreen(session: session),
        );
      },
    );
  }
}
