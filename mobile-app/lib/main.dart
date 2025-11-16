import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:bhutan_bus_system/app/app.dart';
import 'package:bhutan_bus_system/core/di/injection_container.dart' as di;
import 'package:bhutan_bus_system/core/config/app_config.dart';
import 'package:bhutan_bus_system/core/services/notification_service.dart';
import 'package:bhutan_bus_system/core/services/auth_service.dart';
import 'package:bhutan_bus_system/core/bloc/theme/theme_bloc.dart';
import 'package:bhutan_bus_system/core/bloc/locale/locale_bloc.dart';

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('Handling a background message: ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // Initialize Easy Localization
  await EasyLocalization.ensureInitialized();

  // Initialize Dependency Injection
  await di.init();

  // Initialize Notification Service
  await NotificationService.initialize();

  // Initialize Secure Storage
  const secureStorage = FlutterSecureStorage();

  // Check for stored theme and locale preferences
  final savedThemeMode = await secureStorage.read(key: 'theme_mode');
  final savedLocale = await secureStorage.read(key: 'locale');

  runApp(
    EasyLocalization(
      supportedLocales: const [
        Locale('en', 'US'), // English
        Locale('dz', 'BT'), // Dzongkha (Bhutan)
      ],
      path: 'assets/translations',
      fallbackLocale: const Locale('en', 'US'),
      child: MultiBlocProvider(
        providers: [
          BlocProvider(
            create: (context) => di.getIt<ThemeBloc>()
              ..add(ThemeChanged(
                savedThemeMode != null
                  ? ThemeMode.values.firstWhere(
                      (mode) => mode.toString() == savedThemeMode,
                      orElse: () => ThemeMode.system,
                    )
                  : ThemeMode.system
              )),
          ),
          BlocProvider(
            create: (context) => di.getIt<LocaleBloc>()
              ..add(LocaleChanged(
                savedLocale != null
                  ? Locale(savedLocale)
                  : const Locale('en', 'US')
              )),
          ),
        ],
        child: BhutanBusSystemApp(
          initialTheme: savedThemeMode,
          initialLocale: savedLocale,
        ),
      ),
    ),
  );
}

class BhutanBusSystemApp extends StatelessWidget {
  final String? initialTheme;
  final String? initialLocale;

  const BhutanBusSystemApp({
    Key? key,
    this.initialTheme,
    this.initialLocale,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ThemeBloc, ThemeState>(
      builder: (context, themeState) {
        return BlocBuilder<LocaleBloc, LocaleState>(
          builder: (context, localeState) {
            return MaterialApp.router(
              title: 'Bhutan Bus System',
              debugShowCheckedModeBanner: false,
              theme: AppTheme.lightTheme,
              darkTheme: AppTheme.darkTheme,
              themeMode: themeState.themeMode,
              locale: localeState.locale,
              localizationsDelegates: const [
                EasyLocalization.of(context)!.delegates,
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              supportedLocales: context.supportedLocales,
              routerConfig: AppRouter.router,
              builder: (context, child) {
                return MediaQuery(
                  // Prevent font scaling beyond reasonable limits
                  data: MediaQuery.of(context).copyWith(
                    textScaleFactor: MediaQuery.of(context).textScaleFactor.clamp(0.8, 1.2),
                  ),
                  child: child!,
                );
              },
            );
          },
        );
      },
    );
  }
}

// App Theme Configuration
class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF1565C0), // Blue for Bhutan
        brightness: Brightness.light,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Color(0xFF1565C0),
        titleTextStyle: TextStyle(
          color: Color(0xFF1565C0),
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF1565C0),
          foregroundColor: Colors.white,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFF1565C0), width: 2),
        ),
        filled: true,
        fillColor: Colors.grey[50],
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: Color(0xFF1565C0),
        ),
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: Color(0xFF1565C0),
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: Color(0xFF1565C0),
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: Color(0xFF333333),
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: Color(0xFF666666),
        ),
      ),
      fontFamily: 'Roboto',
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF1565C0),
        brightness: Brightness.dark,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Color(0xFF64B5F6),
        titleTextStyle: TextStyle(
          color: Color(0xFF64B5F6),
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardTheme(
        elevation: 4,
        color: const Color(0xFF1E1E1E),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF1565C0),
          foregroundColor: Colors.white,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey[600]!),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFF64B5F6), width: 2),
        ),
        filled: true,
        fillColor: const Color(0xFF2A2A2A),
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: Color(0xFF64B5F6),
        ),
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: Color(0xFF64B5F6),
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: Color(0xFF64B5F6),
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: Color(0xFFE0E0E0),
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: Color(0xFFBDBDBD),
        ),
      ),
      fontFamily: 'Roboto',
    );
  }
}