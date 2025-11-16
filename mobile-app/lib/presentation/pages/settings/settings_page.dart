import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:bhutan_bus_system/app/app.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({Key? key}) : super(key: key);

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _notificationsEnabled = true;
  bool _locationEnabled = true;
  bool _darkMode = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('settings'.tr()),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            // General Settings
            _buildSectionTitle('general'.tr()),
            _buildSwitchItem(
              icon: Icons.notifications,
              title: 'push_notifications'.tr(),
              subtitle: 'receive_bus_notifications'.tr(),
              value: _notificationsEnabled,
              onChanged: (value) {
                setState(() {
                  _notificationsEnabled = value;
                });
              },
            ),
            _buildSwitchItem(
              icon: Icons.location_on,
              title: 'location_services'.tr(),
              subtitle: 'enable_gps_tracking'.tr(),
              value: _locationEnabled,
              onChanged: (value) {
                setState(() {
                  _locationEnabled = value;
                });
              },
            ),
            _buildSwitchItem(
              icon: Icons.dark_mode,
              title: 'dark_mode'.tr(),
              subtitle: 'switch_theme'.tr(),
              value: _darkMode,
              onChanged: (value) {
                setState(() {
                  _darkMode = value;
                });
              },
            ),
            const SizedBox(height: 24),

            // Account Settings
            _buildSectionTitle('account'.tr()),
            _buildMenuItem(
              icon: Icons.person,
              title: 'edit_profile'.tr(),
              onTap: () {},
            ),
            _buildMenuItem(
              icon: Icons.credit_card,
              title: 'digital_card_settings'.tr(),
              onTap: () {},
            ),
            _buildMenuItem(
              icon: Icons.security,
              title: 'privacy_security'.tr(),
              onTap: () {},
            ),
            const SizedBox(height: 24),

            // App Settings
            _buildSectionTitle('app'.tr()),
            _buildMenuItem(
              icon: Icons.language,
              title: 'language'.tr(),
              subtitle: 'change_app_language'.tr(),
              trailing: Text('English'),
              onTap: () {},
            ),
            _buildMenuItem(
              icon: Icons.monetization_on,
              title: 'currency'.tr(),
              subtitle: 'select_display_currency'.tr(),
              trailing: Text('BTN'),
              onTap: () {},
            ),
            _buildMenuItem(
              icon: Icons.info,
              title: 'about'.tr(),
              subtitle: 'app_version_info'.tr(),
              onTap: () {},
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildSwitchItem({
    required IconData icon,
    required String title,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).colorScheme.outline.withOpacity(0.2),
        ),
      ),
      child: ListTile(
        leading: Icon(
          icon,
          color: Theme.of(context).colorScheme.primary,
        ),
        title: Text(title),
        subtitle: subtitle != null
            ? Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                ),
              )
            : null,
        trailing: Switch(
          value: value,
          onChanged: onChanged,
          activeColor: Theme.of(context).colorScheme.primary,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
      ),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String title,
    String? subtitle,
    Widget? trailing,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Theme.of(context).colorScheme.outline.withOpacity(0.2),
            ),
          ),
          child: ListTile(
            leading: Icon(
              icon,
              color: Theme.of(context).colorScheme.primary,
            ),
            title: Text(title),
            subtitle: subtitle != null
                ? Text(
                    subtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                    ),
                  )
                : null,
            trailing: trailing,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          ),
        ),
      ),
    );
  }
}