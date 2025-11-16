import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:bhutan_bus_system/app/app.dart';
import 'package:bhutan_bus_system/presentation/widgets/common/bus_card.dart';

class BusTrackingPage extends StatefulWidget {
  final String? busId;

  const BusTrackingPage({Key? key, this.busId}) : super(key: key);

  @override
  State<BusTrackingPage> createState() => _BusTrackingPageState();
}

class _BusTrackingPageState extends State<BusTrackingPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  Icon(
                    Icons.directions_bus,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'live_bus_tracking'.tr(),
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        if (widget.busId != null)
                          Text(
                            'bus_number_x'.tr(args: [widget.busId!]),
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Map Container (placeholder)
            Expanded(
              flex: 2,
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 16.0),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.outline.withOpacity(0.2),
                  ),
                ),
                child: const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.map,
                        size: 64,
                        color: AppColors.primary,
                      ),
                      SizedBox(height: 16),
                      Text(
                        'map_coming_soon'.tr(),
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'map_placeholder'.tr(),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.onSurface.withOpacity(0.6),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Nearby Buses List
            Expanded(
              flex: 1,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    child: Text(
                      'nearby_buses'.tr(),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      children: [
                        BusCard(
                          busNumber: '12',
                          route: 'Memorial Chorten - Clock Tower',
                          distance: '0.3 km',
                          eta: '5 min',
                          capacity: 'normal',
                        ),
                        const SizedBox(height: 12),
                        BusCard(
                          busNumber: '8',
                          route: 'Thimphu Town - Motithang',
                          distance: '0.5 km',
                          eta: '8 min',
                          capacity: 'moderate',
                        ),
                        const SizedBox(height: 12),
                        BusCard(
                          busNumber: '3',
                          route: 'Changlimithang - Babesa',
                          distance: '0.8 km',
                          eta: '12 min',
                          capacity: 'low',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}