import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:bhutan_bus_system/core/config/app_constants.dart';
import 'package:bhutan_bus_system/core/services/auth_service.dart';
import 'package:bhutan_bus_system/core/di/injection_container.dart' as di;

class MainNavigation extends StatefulWidget {
  final Widget child;

  const MainNavigation({
    Key? key,
    required this.child,
  }) : super(key: key);

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  int _currentIndex = 0;

  final List<NavigationItem> _navigationItems = [
    NavigationItem(
      icon: Icons.home_outlined,
      activeIcon: Icons.home,
      label: 'home',
      route: '/home',
    ),
    NavigationItem(
      icon: Icons.directions_bus_outlined,
      activeIcon: Icons.directions_bus,
      label: 'tracking',
      route: '/tracking',
    ),
    NavigationItem(
      icon: Icons.route_outlined,
      activeIcon: Icons.route,
      label: 'routes',
      route: '/routes',
    ),
    NavigationItem(
      icon: Icons.credit_card_outlined,
      activeIcon: Icons.credit_card,
      label: 'card',
      route: '/card',
    ),
    NavigationItem(
      icon: Icons.history_outlined,
      activeIcon: Icons.history,
      label: 'history',
      route: '/history',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 4,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
            context.go(_navigationItems[index].route);
          },
          type: BottomNavigationBarType.fixed,
          items: _navigationItems.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;
            return BottomNavigationBarItem(
              icon: Icon(
                item.icon,
                color: _currentIndex == index
                    ? Theme.of(context).colorScheme.primary
                    : Colors.grey[600],
              ),
              activeIcon: Icon(
                item.activeIcon,
                color: Theme.of(context).colorScheme.primary,
              ),
              label: item.label.tr(),
            );
          }).toList(),
          selectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
          unselectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.w400,
            fontSize: 12,
          ),
          selectedItemColor: Theme.of(context).colorScheme.primary,
          unselectedItemColor: Colors.grey[600],
          backgroundColor: Theme.of(context).colorScheme.surface,
          elevation: 8,
        ),
      ),
    );
  }
}

class NavigationItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String route;

  const NavigationItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.route,
  });
}

class CustomAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final bool automaticallyImplyLeading;
  final Widget? leading;
  final VoidCallback? onMenuPressed;
  final bool showSOS;

  const CustomAppBar({
    Key? key,
    required this.title,
    this.actions,
    this.automaticallyImplyLeading = true,
    this.leading,
    this.onMenuPressed,
    this.showSOS = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: Text(
        title,
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
      centerTitle: true,
      elevation: 0,
      backgroundColor: Colors.transparent,
      foregroundColor: Theme.of(context).colorScheme.primary,
      automaticallyImplyLeading: automaticallyImplyLeading,
      leading: leading,
      actions: [
        if (showSOS) ...[
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppColors.error,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.emergency,
                color: Colors.white,
                size: 20,
              ),
            ),
            onPressed: () {
              _showSOSDialog(context);
            },
            tooltip: 'SOS',
          ),
          const SizedBox(width: 8),
        ],
        if (actions != null) ...actions!,
        const SizedBox(width: 8),
      ],
    );
  }

  void _showSOSDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('emergency_title'.tr()),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.emergency,
                color: AppColors.error,
                size: 64,
              ),
              const SizedBox(height: 16),
              Text(
                'emergency_description'.tr(),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('cancel'.tr()),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop();
                context.go('/sos');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
              ),
              child: Text('activate_sos'.tr()),
            ),
          ],
        );
      },
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}

class FloatingActionButtonWithMenu extends StatefulWidget {
  final VoidCallback onScanQR;
  final VoidCallback onNearbyStops;
  final VoidCallback onReportIssue;

  const FloatingActionButtonWithMenu({
    Key? key,
    required this.onScanQR,
    required this.onNearbyStops,
    required this.onReportIssue,
  }) : super(key: key);

  @override
  State<FloatingActionButtonWithMenu> createState() => _FloatingActionButtonWithMenuState();
}

class _FloatingActionButtonWithMenuState extends State<FloatingActionButtonWithMenu>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _expandAnimation;
  bool _isExpanded = false;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
    _expandAnimation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOut,
    );
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() {
      _isExpanded = !_isExpanded;
      if (_isExpanded) {
        _animationController.forward();
      } else {
        _animationController.reverse();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Scan QR button
          _buildMiniFab(
            icon: Icons.qr_code_scanner,
            label: 'scan_qr'.tr(),
            onPressed: widget.onScanQR,
            visible: _isExpanded,
            animationValue: _expandAnimation.value,
          ),
          const SizedBox(height: 12),
          // Nearby stops button
          _buildMiniFab(
            icon: Icons.location_on,
            label: 'nearby_stops'.tr(),
            onPressed: widget.onNearbyStops,
            visible: _isExpanded,
            animationValue: _expandAnimation.value,
          ),
          const SizedBox(height: 12),
          // Report issue button
          _buildMiniFab(
            icon: Icons.report_problem,
            label: 'report_issue'.tr(),
            onPressed: widget.onReportIssue,
            visible: _isExpanded,
            animationValue: _expandAnimation.value,
          ),
          const SizedBox(height: 12),
          // Main FAB
          FloatingActionButton(
            onPressed: _toggle,
            backgroundColor: Theme.of(context).colorScheme.primary,
            child: AnimatedIcon(
              icon: AnimatedIcons.menu_close,
              progress: _expandAnimation,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniFab({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    required bool visible,
    required double animationValue,
  }) {
    return Transform.scale(
      scale: animationValue,
      child: Opacity(
        opacity: animationValue,
        child: FloatingActionButton.extended(
          onPressed: onPressed,
          backgroundColor: Theme.of(context).colorScheme.secondary,
          icon: Icon(
            icon,
            color: Colors.white,
            size: 20,
          ),
          label: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
            ),
          ),
          heroTag: null,
        ),
      ),
    );
  }
}