# 🚌 Bhutan Bus System

A comprehensive public transit management system for Bhutan with real-time tracking, digital payments, and fleet management.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Flutter 3.0+
- Redis (optional, for caching)

### 1. Database Setup

```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb bhutan_bus_system

# Create user (optional, can use default postgres)
sudo -u postgres createuser --interactive
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
nano .env

# Run database migration
npm run migrate

# Seed sample data
npm run seed

# Start the server
npm run dev
```

The backend will be available at: `http://localhost:5000`

### 3. Mobile App Setup

```bash
cd mobile-app

# Install Flutter dependencies
flutter pub get

# Install platform-specific dependencies
# For Android
flutter pub run flutter_native_splash:create
flutter pub run flutter_launcher_icons:main

# Run the app
flutter run
```

## 📱 Access Points

- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/health
- **Mobile App**: Runs on your device/emulator
- **Database**: PostgreSQL on localhost:5432

## 🔧 Configuration

### Backend Environment Variables

```bash
# Server
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bhutan_bus_system
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Payment Gateways
BOB_CLIENT_ID=your-bob-client-id
BOB_CLIENT_SECRET=your-bob-client-secret
BNB_CLIENT_ID=your-bnb-client-id
BNB_CLIENT_SECRET=your-bnb-client-secret
```

### Mobile App Configuration

The mobile app connects to the backend API by default. If your backend runs on a different IP, update the `baseUrl` in `lib/core/config/app_config.dart`.

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Mobile App Tests
```bash
cd mobile-app
flutter test
```

## 📊 Sample Data

The system comes with sample data including:
- 5 bus routes across Thimphu
- 10 bus stops with GPS coordinates
- 5 buses with real-time locations
- 5 drivers with assignments
- Bus schedules and timetables
- Admin user: `admin@bhutanbus.bt` / `admin123`

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Bus Tracking
- `GET /api/buses` - Get all buses with locations
- `GET /api/buses/:id/location` - Get specific bus location
- `GET /api/buses/nearby` - Find nearby buses

### Route Planning
- `POST /api/routes/find` - Find routes between points
- `GET /api/routes/:id` - Get route details
- `GET /api/routes/nearby/:lat/:lon` - Routes near location

### Digital Card
- `GET /api/cards` - Get user's digital card
- `POST /api/cards/recharge` - Recharge card
- `GET /api/cards/qr` - Generate QR code

### Payments
- `POST /api/payments/initialize` - Initialize payment
- `GET /api/payments/history` - Payment history

## 🛠 Development

### Project Structure

```
bus-system/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── controllers/     # Route handlers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Data models
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Express middleware
│   │   └── websocket/       # WebSocket handlers
│   ├── migrations/          # Database migrations
│   ├── seeds/               # Sample data
│   └── scripts/             # Utility scripts
├── mobile-app/              # Flutter mobile app
│   ├── lib/
│   │   ├── core/            # Core utilities
│   │   ├── features/        # Feature modules
│   │   ├── presentation/    # UI components
│   │   └── widgets/         # Reusable widgets
│   └── assets/              # App resources
├── admin-dashboard/         # React admin dashboard
└── database/               # Database schemas
```

## 🌟 Features Implemented

### ✅ Core Features
- User authentication with phone/email verification
- Digital bus cards with QR code generation
- Real-time bus tracking with WebSocket
- Smart route planning with fare calculation
- Mobile payment integration (Bank of Bhutan, BNB)
- Bhutan-specific fare structure (Nu 5 base + Nu 1/stop)

### 🏗 Foundation
- Complete backend API with PostgreSQL database
- Flutter mobile app foundation
- Real-time WebSocket communication
- Secure authentication system
- Payment gateway integration

## 🚧 Next Steps

Features ready for implementation:
- Complete mobile app UI (login, tracking, routes, etc.)
- Admin dashboard for fleet management
- Push notifications
- Offline mode support
- Advanced safety features

## 📞 Support

For issues and questions:
1. Check the logs in the backend console
2. Verify database connection
3. Ensure all environment variables are set
4. Check mobile app network connectivity

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built for the Bhutan Transport Authority** 🇧🇹