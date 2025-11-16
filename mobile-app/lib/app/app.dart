import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:bhutan_bus_system/core/config/routes.dart';
import 'package:bhutan_bus_system/core/services/auth_service.dart';
import 'package:bhutan_bus_system/core/bloc/auth/auth_bloc.dart';
import 'package:bhutan_bus_system/presentation/pages/splash/splash_page.dart';
import 'package:bhutan_bus_system/presentation/pages/auth/login_page.dart';
import 'package:bhutan_bus_system/presentation/pages/auth/register_page.dart';
import 'package:bhutan_bus_system/presentation/pages/home/home_page.dart';
import 'package:bhutan_bus_system/presentation/pages/tracking/bus_tracking_page.dart';
import 'package:bhutan_bus_system/presentation/pages/routes/route_finder_page.dart';
import 'package:bhutan_bus_system/presentation/pages/payment/card_page.dart';
import 'package:bhutan_bus_system/presentation/pages/payment/recharge_page.dart';
import 'package:bhutan_bus_system/presentation/pages/history/ride_history_page.dart';
import 'package:bhutan_bus_system/presentation/pages/profile/profile_page.dart';
import 'package:bhutan_bus_system/presentation/pages/settings/settings_page.dart';
import 'package:bhutan_bus_system/presentation/pages/safety/sos_page.dart';
import 'package:bhutan_bus_system/presentation/widgets/navigation/main_navigation.dart';
import 'package:bhutan_bus_system/core/di/injection_container.dart' as di;

class AppRouter {
  static final router = GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final authBloc = di.getIt<AuthBloc>();
      final authService = di.getIt<AuthService>();

      // Check if user is authenticated
      final isAuthenticated = authService.currentUser != null;

      final splashLocation = state.namedLocation('splash');
      final loginLocation = state.namedLocation('login');
      final homeLocation = state.namedLocation('home');

      // Allow access to splash page
      if (state.location.toString() == '/splash') {
        return null;
      }

      // Redirect to login if not authenticated and trying to access protected routes
      if (!isAuthenticated &&
          !state.location.toString().startsWith('/auth') &&
          state.location.toString() != '/') {
        return loginLocation;
      }

      // Redirect to home if authenticated and trying to access auth pages
      if (isAuthenticated && state.location.toString().startsWith('/auth')) {
        return homeLocation;
      }

      return null;
    },
    routes: [
      // Splash Screen
      GoRoute(
        name: 'splash',
        path: '/splash',
        builder: (context, state) => const SplashPage(),
      ),

      // Authentication Routes
      GoRoute(
        name: 'login',
        path: '/login',
        builder: (context, state) => const LoginPage(),
      ),

      GoRoute(
        name: 'register',
        path: '/register',
        builder: (context, state) => const RegisterPage(),
      ),

      // Main Navigation Wrapper
      ShellRoute(
        builder: (context, state, child) {
          return MainNavigation(
            child: child,
          );
        },
        routes: [
          // Home
          GoRoute(
            name: 'home',
            path: '/home',
            builder: (context, state) => const HomePage(),
          ),

          // Bus Tracking
          GoRoute(
            name: 'bus-tracking',
            path: '/tracking',
            builder: (context, state) => const BusTrackingPage(),
            routes: [
              GoRoute(
                name: 'bus-details',
                path: '/bus/:busId',
                builder: (context, state) {
                  final busId = state.pathParameters['busId']!;
                  return BusTrackingPage(busId: busId);
                },
              ),
            ],
          ),

          // Route Finder
          GoRoute(
            name: 'route-finder',
            path: '/routes',
            builder: (context, state) => const RouteFinderPage(),
          ),

          // Digital Card
          GoRoute(
            name: 'card',
            path: '/card',
            builder: (context, state) => const CardPage(),
            routes: [
              GoRoute(
                name: 'recharge',
                path: '/recharge',
                builder: (context, state) => const RechargePage(),
              ),
            ],
          ),

          // Ride History
          GoRoute(
            name: 'ride-history',
            path: '/history',
            builder: (context, state) => const RideHistoryPage(),
          ),

          // Profile
          GoRoute(
            name: 'profile',
            path: '/profile',
            builder: (context, state) => const ProfilePage(),
          ),

          // Settings
          GoRoute(
            name: 'settings',
            path: '/settings',
            builder: (context, state) => const SettingsPage(),
          ),
        ],
      ),

      // Safety Routes (no bottom navigation)
      GoRoute(
        name: 'sos',
        path: '/sos',
        builder: (context, state) => const SOSPage(),
      ),

      // Fallback route
      GoRoute(
        path: '/:path(.*)',
        builder: (context, state) {
          return Scaffold(
            appBar: AppBar(title: const Text('Page Not Found')),
            body: const Center(
              child: Text('The page you are looking for does not exist.'),
            ),
          );
        },
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Error')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Something went wrong.'),
            const SizedBox(height: 16),
            Text('Error: ${state.error}'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.go('/home'),
              child: const Text('Go Home'),
            ),
          ],
        ),
      ),
    ),
  );
}

class AppConstants {
  // API Configuration
  static const String baseUrl = 'https://api.bhutanbus.bt';
  static const String wsUrl = 'wss://api.bhutanbus.bt/ws';

  // App Configuration
  static const String appName = 'Bhutan Bus System';
  static const String appVersion = '1.0.0';

  // Storage Keys
  static const String tokenKey = 'auth_token';
  static const String refreshTokenKey = 'refresh_token';
  static const String userKey = 'user_data';
  static const String themeKey = 'theme_mode';
  static const String localeKey = 'locale';

  // Map Configuration
  static const double defaultZoom = 13.0;
  static const double maxZoom = 18.0;
  static const double minZoom = 2.0;

  // Bus Tracking
  static const Duration locationUpdateInterval = Duration(seconds: 10);
  static const Duration maxLocationAge = Duration(minutes: 5);

  // Notification Channels
  static const String busArrivalChannel = 'bus_arrival';
  static const String lowBalanceChannel = 'low_balance';
  static const String emergencyChannel = 'emergency';
  static const String serviceAlertsChannel = 'service_alerts';

  // Fare Configuration
  static const double baseFare = 5.0; // Nu
  static const double perStopFare = 1.0; // Nu
  static const double maxRechargeAmount = 5000.0; // Nu
  static const double minRechargeAmount = 10.0; // Nu

  // Route Planning
  static const double maxWalkingDistance = 800.0; // meters
  static const int maxTransfers = 2;

  // UI Constants
  static const double borderRadius = 12.0;
  static const double cardElevation = 2.0;
  static const double buttonHeight = 48.0;
  static const EdgeInsets defaultPadding = EdgeInsets.all(16.0);

  // Animation Durations
  static const Duration shortAnimation = Duration(milliseconds: 200);
  static const Duration mediumAnimation = Duration(milliseconds: 300);
  static const Duration longAnimation = Duration(milliseconds: 500);
}

class AppColors {
  static const Color primary = Color(0xFF1565C0); // Blue
  static const Color primaryDark = Color(0xFF0D47A1);
  static const Color primaryLight = Color(0xFF64B5F6);

  static const Color secondary = Color(0xFFFF9800); // Orange
  static const Color secondaryDark = Color(0xFFE65100);
  static const Color secondaryLight = Color(0xFFFFE0B2);

  static const Color success = Color(0xFF4CAF50);
  static const Color warning = Color(0xFFFF9800);
  static const Color error = Color(0xFFF44336);
  static const Color info = Color(0xFF2196F3);

  static const Color background = Color(0xFFFAFAFA);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color onSurface = Color(0xFF212121);
  static const Color onBackground = Color(0xFF212121);

  // Bus Status Colors
  static const Color busActive = Color(0xFF4CAF50);
  static const Color busDelayed = Color(0xFFFF9800);
  static const Color busOffline = Color(0xFF9E9E9E);

  // Capacity Colors
  static const Color capacityLow = Color(0xFF4CAF50); // Green
  static const Color capacityMedium = Color(0xFFFF9800); // Orange
  static const Color capacityHigh = Color(0xFFF44336); // Red
}

class AppTextStyles {
  static const TextStyle headingLarge = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.bold,
    color: AppColors.primary,
  );

  static const TextStyle headingMedium = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w600,
    color: AppColors.primary,
  );

  static const TextStyle headingSmall = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    color: AppColors.primary,
  );

  static const TextStyle titleLarge = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    color: AppColors.onSurface,
  );

  static const TextStyle titleMedium = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: AppColors.onSurface,
  );

  static const TextStyle bodyLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.normal,
    color: AppColors.onSurface,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.normal,
    color: AppColors.onSurface,
  );

  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.normal,
    color: AppColors.onSurface,
  );

  static const TextStyle caption = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.normal,
    color: AppColors.onSurface,
  );
}