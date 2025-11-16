import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:bhutan_bus_system/app/app.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({Key? key}) : super(key: key);

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    ));

    _initializeApp();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _initializeApp() async {
    // Simulate app initialization
    await Future.delayed(const Duration(milliseconds: 1500));

    if (mounted) {
      // Check if user is logged in (mock for now)
      final isLoggedIn = false; // TODO: Implement auth check

      if (isLoggedIn) {
        context.go('/home');
      } else {
        context.go('/login');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.primary,
      body: Center(
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Logo
              Icon(
                Icons.directions_bus,
                size: 100,
                color: Colors.white,
              ),
              const SizedBox(height: 24),

              // App Name
              Text(
                'bhutan_bus_system'.tr(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),

              // Tagline
              Text(
                'real_time_transit_tracking'.tr(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 48),

              // Loading Indicator
              const CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class FadeTransition extends StatelessWidget {
  final Widget child;
  final Animation<double> opacity;

  const FadeTransition({
    Key? key,
    required this.child,
    required this.opacity,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: opacity,
      builder: (context, child) {
        return Opacity(
          opacity: opacity.value,
          child: child,
        );
      },
      child: child,
    );
  }
}