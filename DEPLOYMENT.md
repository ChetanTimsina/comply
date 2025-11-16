# Bhutan Bus System - Deployment Guide

## Quick Start for VS Code

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (v6+)
- Flutter SDK (v3.16+)
- Git
- VS Code

### 1. Clone and Setup Repository

```bash
# Create GitHub repository first on github.com, then:
git clone https://github.com/YOUR_USERNAME/bhutan-bus-system.git
cd bhutan-bus-system
```

### 2. Database Setup

```bash
# Start PostgreSQL service
# On macOS/Linux:
sudo systemctl start postgresql  # or brew services start postgresql

# Create database
createdb bhutan_bus_system

# Run migrations
cd backend
psql -d bhutan_bus_system -f database/migrations/001_initial_migration.sql

# Insert sample data
psql -d bhutan_bus_system -f database/seeds/001_sample_data.sql
```

### 3. Environment Configuration

Create `.env` file in `/backend`:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/bhutan_bus_system

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Server
PORT=5000
NODE_ENV=development

# Redis
REDIS_URL=redis://localhost:6379

# Payment Gateways (Testing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Bhutanese Banks (Testing Mode)
BOB_API_URL=https://test.bob.com.bt
BNB_API_URL=https://test.bnb.com.bt

# Frontend URL
CLIENT_URL=http://localhost:3000
```

### 4. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Start development server
npm run dev
# or
node server.js
```

Backend will run on `http://localhost:5000`

### 5. Mobile App Setup

```bash
cd mobile-app

# Get Flutter dependencies
flutter pub get

# Run in VS Code or terminal:
flutter run
# or for specific platform:
flutter run -d chrome  # Web version in Chrome
flutter run -d android # Android device/emulator
```

### 6. VS Code Configuration

Install these VS Code extensions:
- Flutter
- Dart
- PostgreSQL
- Thunder Client (for API testing)
- Redis

### 7. Verify Setup

1. **Backend Health Check**: Open `http://localhost:5000/health` in browser
2. **Mobile App**: Should load the splash screen and navigate to login
3. **Database**: Connect with `psql -d bhutan_bus_system` and verify tables

---

## Testing the System

### 1. Test Authentication

```bash
# Register a new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "cid_number": "12345678901",
    "phone_number": "+97517123456",
    "full_name": "Tashi Dorji",
    "email": "tashi@example.com"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+97517123456",
    "password": "password123"
  }'
```

### 2. Test Mobile App Features

1. **Login**: Use the registered credentials
2. **Digital Card**: View your bus card in the app
3. **Live Tracking**: See buses on the map
4. **Route Finder**: Search for routes between locations
5. **SOS Button**: Test the emergency feature

### 3. Test Real-time Features

- Open multiple app instances
- Start a bus journey in one
- See real-time updates in the other

---

## GitHub Push Instructions

### 1. Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click "New repository"
3. Name it: `bhutan-bus-system`
4. Add description: "Complete bus transit management system for Bhutan"
5. Choose Public or Private
6. Don't initialize with README (we already have files)
7. Click "Create repository"

### 2. Push to GitHub

```bash
# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/bhutan-bus-system.git

# Push all files to GitHub
git push -u origin main

# For subsequent pushes:
git push origin main
```

### 3. Verify GitHub Repository

- Open your repository on GitHub
- Verify all files are present
- Check the README.md displays correctly

---

## Production Deployment

### Option 1: Vercel (Recommended for Backend)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy backend
cd backend
vercel --prod

# Set environment variables in Vercel dashboard
```

### Option 2: Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Option 3: DigitalOcean/AWS

Use the provided Docker configurations in `/docker/` directory.

---

## Troubleshooting

### Database Issues
```bash
# Reset database completely
dropdb bhutan_bus_system
createdb bhutan_bus_system
psql -d bhutan_bus_system -f database/migrations/001_initial_migration.sql
```

### Flutter Issues
```bash
# Clean Flutter project
cd mobile-app
flutter clean
flutter pub get
```

### Backend Issues
```bash
# Clear node modules and reinstall
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Port Conflicts
- Backend: Change PORT in .env file
- PostgreSQL: Use different port in DATABASE_URL
- Redis: Use different port in REDIS_URL

---

## Development Workflow

### 1. Daily Development

```bash
# Start all services
# Terminal 1: PostgreSQL
sudo systemctl start postgresql

# Terminal 2: Redis
redis-server

# Terminal 3: Backend
cd backend && npm run dev

# Terminal 4: Mobile App (for web)
cd mobile-app && flutter run -d chrome
```

### 2. Making Changes

```bash
# After making changes:
git add .
git commit -m "feat: describe your changes"
git push origin main
```

### 3. Testing

```bash
# Run backend tests
cd backend
npm test

# Run mobile app tests
cd mobile-app
flutter test
```

---

## API Documentation

Once backend is running, visit:
- Swagger UI: `http://localhost:5000/api-docs`
- Health Check: `http://localhost:5000/health`

## Support

For issues:
1. Check the logs in terminal
2. Verify database connection
3. Check environment variables
4. Review this deployment guide

Enjoy using your Bhutan Bus System! 🚌