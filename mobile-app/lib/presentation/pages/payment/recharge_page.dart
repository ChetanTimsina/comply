import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:bhutan_bus_system/app/app.dart';
import 'package:bhutan_bus_system/presentation/widgets/common/loading_button.dart';

class RechargePage extends StatefulWidget {
  const RechargePage({Key? key}) : super(key: key);

  @override
  State<RechargePage> createState() => _RechargePageState();
}

class _RechargePageState extends State<RechargePage> {
  final _amountController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  String _selectedMethod = 'mobile_wallet';
  bool _isLoading = false;

  final List<PaymentMethod> _paymentMethods = [
    PaymentMethod(
      id: 'mobile_wallet',
      name: 'Mobile Wallet',
      description: 'M-BOB, BNB Mobile',
      icon: Icons.phone_android,
      color: AppColors.primary,
    ),
    PaymentMethod(
      id: 'bank_card',
      name: 'Bank Card',
      description: 'Visa, Mastercard',
      icon: Icons.credit_card,
      color: AppColors.warning,
    ),
    PaymentMethod(
      id: 'qr_code',
      name: 'QR Code',
      description: 'Scan to pay',
      icon: Icons.qr_code_scanner,
      color: AppColors.success,
    ),
  ];

  final List<int> _quickAmounts = [50, 100, 200, 500];

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('recharge_card'.tr()),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Current Balance
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20.0),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.primary,
                        AppColors.primaryDark,
                      ],
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      Text(
                        'current_balance'.tr(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '245.50',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 32,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        'btn',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Amount Input
                Text(
                  'enter_amount'.tr(),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'amount'.tr(),
                    prefixText: 'Nu ',
                    prefixStyle: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'amount_required'.tr();
                    }
                    final amount = double.tryParse(value);
                    if (amount == null || amount < 10) {
                      return 'min_amount'.tr(args: ['10']);
                    }
                    if (amount > 5000) {
                      return 'max_amount'.tr(args: ['5000']);
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Quick Amounts
                Text(
                  'quick_amounts'.tr(),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _quickAmounts.map((amount) {
                    return ActionChip(
                      label: Text('Nu $amount'),
                      onPressed: () {
                        _amountController.text = amount.toString();
                      },
                      backgroundColor: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 24),

                // Payment Methods
                Text(
                  'payment_method'.tr(),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                ..._paymentMethods.map((method) {
                  return _buildPaymentMethod(method);
                }),
                const SizedBox(height: 32),

                // Recharge Button
                LoadingButton(
                  text: 'recharge_now'.tr(),
                  onPressed: _isLoading ? null : _recharge,
                  isLoading: _isLoading,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPaymentMethod(PaymentMethod method) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            setState(() {
              _selectedMethod = method.id;
            });
          },
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _selectedMethod == method.id
                  ? method.color.withOpacity(0.1)
                  : Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _selectedMethod == method.id
                    ? method.color
                    : Theme.of(context).colorScheme.outline.withOpacity(0.2),
                width: _selectedMethod == method.id ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: method.color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    method.icon,
                    color: method.color,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        method.name,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        method.description,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_selectedMethod == method.id)
                  Icon(
                    Icons.check_circle,
                    color: method.color,
                    size: 24,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _recharge() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Mock recharge process
      await Future.delayed(const Duration(seconds: 3));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('recharge_success'.tr()),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('recharge_failed'.tr()),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
}

class PaymentMethod {
  final String id;
  final String name;
  final String description;
  final IconData icon;
  final Color color;

  const PaymentMethod({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.color,
  });
}