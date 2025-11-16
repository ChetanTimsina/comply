import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:bhutan_bus_system/app/app.dart';
import 'package:bhutan_bus_system/core/services/auth_service.dart';
import 'package:bhutan_bus_system/core/di/injection_container.dart' as di;
import 'package:bhutan_bus_system/presentation/widgets/common/bus_card.dart';
import 'package:bhutan_bus_system/presentation/widgets/common/quick_action_button.dart';
import 'package:bhutan_bus_system/presentation/widgets/common/stat_card.dart';
import 'package:bhutan_bus_system/presentation/widgets/navigation/custom_app_bar.dart';

class HomePage extends StatefulWidget {
  const HomePage({Key? key}) : super(key: key);

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final AuthService _authService = di.getIt<AuthService>();

  @override
  Widget build(BuildContext context) {
    final user = _authService.currentUser;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _onRefresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Welcome Header
                _buildWelcomeHeader(user),
                const SizedBox(height: 24),

                // Quick Stats
                _buildQuickStats(),
                const SizedBox(height: 24),

                // Quick Actions
                _buildQuickActions(),
                const SizedBox(height: 24),

                // Nearby Buses
                _buildNearbyBuses(),
                const SizedBox(height: 24),

                // Recent Activity
                _buildRecentActivity(),
                const SizedBox(height: 24),

                // Service Announcements
                _buildServiceAnnouncements(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildWelcomeHeader(dynamic user) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'welcome_back'.tr(),
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: AppColors.primary,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          user?.name ?? 'User',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: _getTimeBasedGreeting().color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: _getTimeBasedGreeting().color.withOpacity(0.3),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _getTimeBasedGreeting().icon,
                size: 16,
                color: _getTimeBasedGreeting().color,
              ),
              const SizedBox(width: 4),
              Text(
                _getTimeBasedGreeting().message,
                style: TextStyle(
                  color: _getTimeBasedGreeting().color,
                  fontWeight: FontWeight.w500,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQuickStats() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'quick_stats'.tr(),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: StatCard(
                title: 'card_balance'.tr(),
                value: '245.50',
                unit: 'Nu',
                icon: Icons.account_balance_wallet,
                color: AppColors.success,
                onTap: () => context.go('/card'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatCard(
                title: 'rides_this_month'.tr(),
                value: '23',
                icon: Icons.directions_bus,
                color: AppColors.primary,
                onTap: () => context.go('/history'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'quick_actions'.tr(),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 4,
          mainAxisSpacing: 16,
          crossAxisSpacing: 16,
          childAspectRatio: 1,
          children: [
            QuickActionButton(
              icon: Icons.map,
              label: 'find_route'.tr(),
              onTap: () => context.go('/routes'),
            ),
            QuickActionButton(
              icon: Icons.location_on,
              label: 'nearby_stops'.tr(),
              onTap: _findNearbyStops,
            ),
            QuickActionButton(
              icon: Icons.qr_code_scanner,
              label: 'scan_qr'.tr(),
              onTap: _scanQRCode,
            ),
            QuickActionButton(
              icon: Icons.add,
              label: 'recharge'.tr(),
              onTap: () => context.go('/card/recharge'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildNearbyBuses() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'nearby_buses'.tr(),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Spacer(),
            TextButton(
              onPressed: () => context.go('/tracking'),
              child: Text('view_all'.tr()),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Mock data - in real app, this would be from GPS/location services
        BusCard(
          busNumber: '12',
          route: 'Memorial Chorten - Clock Tower',
          distance: '0.3 km',
          eta: '5 min',
          capacity: 'normal',
          onTap: () => context.go('/tracking/bus/bus-123'),
        ),
        const SizedBox(height: 12),
        BusCard(
          busNumber: '8',
          route: 'Thimphu Town - Motithang',
          distance: '0.5 km',
          eta: '8 min',
          capacity: 'moderate',
          onTap: () => context.go('/tracking/bus/bus-456'),
        ),
      ],
    );
  }

  Widget _buildRecentActivity() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'recent_activity'.tr(),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Spacer(),
            TextButton(
              onPressed: () => context.go('/history'),
              child: Text('view_all'.tr()),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Mock recent rides
        _buildActivityItem(
          icon: Icons.directions_bus,
          title: 'Bus 12',
          subtitle: 'Memorial Chorten → Clock Tower',
          time: '2 hours ago',
          amount: '10 Nu',
        ),
        const SizedBox(height: 12),
        _buildActivityItem(
          icon: Icons.account_balance_wallet,
          title: 'Card Recharge',
          subtitle: 'Mobile Banking',
          time: 'Yesterday',
          amount: '+500 Nu',
          isPositive: true,
        ),
        const SizedBox(height: 12),
        _buildActivityItem(
          icon: Icons.directions_bus,
          title: 'Bus 8',
          subtitle: 'Changlimithang → Babesa',
          time: 'Yesterday',
          amount: '15 Nu',
        ),
      ],
    );
  }

  Widget _buildActivityItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required String time,
    required String amount,
    bool isPositive = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).colorScheme.outline.withOpacity(0.2),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              icon,
              color: Theme.of(context).colorScheme.primary,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                amount,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: isPositive
                      ? AppColors.success
                      : Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                time,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildServiceAnnouncements() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'service_announcements'.tr(),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.warning.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppColors.warning.withOpacity(0.3),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.info,
                    color: AppColors.warning,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'route_change'.tr(),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppColors.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'route_15_delay'.tr(),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 4),
              Text(
                '2_hours_ago'.tr(),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  GreetingData _getTimeBasedGreeting() {
    final hour = DateTime.now().hour;

    if (hour >= 5 && hour < 12) {
      return GreetingData(
        message: 'good_morning'.tr(),
        icon: Icons.wb_sunny,
        color: AppColors.warning,
      );
    } else if (hour >= 12 && hour < 17) {
      return GreetingData(
        message: 'good_afternoon'.tr(),
        icon: Icons.wb_sunny_outlined,
        color: AppColors.primary,
      );
    } else if (hour >= 17 && hour < 21) {
      return GreetingData(
        message: 'good_evening'.tr(),
        icon: Icons.nights_stay,
        color: AppColors.secondary,
      );
    } else {
      return GreetingData(
        message: 'good_night'.tr(),
        icon: Icons.nightlight_round,
        color: AppColors.primaryDark,
      );
    }
  }

  Future<void> _onRefresh() async {
    // Simulate refresh delay
    await Future.delayed(const Duration(seconds: 1));
    setState(() {});
  }

  void _findNearbyStops() {
    // Get current location and find nearby stops
    context.go('/tracking');
  }

  void _scanQRCode() {
    // Open QR scanner
    // This would navigate to QR scanner page
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('qr_scanner_coming_soon'.tr()),
        backgroundColor: AppColors.info,
      ),
    );
  }
}

class GreetingData {
  final String message;
  final IconData icon;
  final Color color;

  const GreetingData({
    required this.message,
    required this.icon,
    required this.color,
  });
}