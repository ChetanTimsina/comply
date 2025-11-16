#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function runSeeds() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bhutan_bus_system',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  });

  try {
    console.log('🌱 Starting database seeding...');

    // Read seed file
    const seedPath = path.join(__dirname, '../seeds/001_sample_data.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf8');

    // Execute seed
    await pool.query(seedSQL);

    console.log('✅ Seeding completed successfully!');
    console.log('\n📊 Sample data created:');
    console.log('   - 5 bus routes');
    console.log('   - 10 bus stops');
    console.log('   - 5 buses with GPS locations');
    console.log('   - 5 drivers');
    console.log('   - Bus schedules');
    console.log('   - Admin user (admin@bhutanbus.bt / admin123)');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runSeeds();
}

module.exports = { runSeeds };