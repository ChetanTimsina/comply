const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection configuration
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bhutan_bus_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of connections in pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
};

const pool = new Pool(poolConfig);

// Database connection event listeners
pool.on('connect', (client) => {
  logger.info('New database client connected');
});

pool.on('error', (err, client) => {
  logger.error('Database connection error:', err);
});

pool.on('remove', (client) => {
  logger.info('Database client removed');
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful');
    return true;
  } catch (err) {
    logger.error('Database connection failed:', err);
    return false;
  }
};

// Execute query with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query failed', { text, duration, error: error.message });
    throw error;
  }
};

// Execute transaction
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get single row
const getRow = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Get multiple rows
const getRows = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Get single value
const getValue = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : null;
};

// Insert record and return ID
const insert = async (table, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');

  const text = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`;
  const result = await query(text, values);
  return result.rows[0].id;
};

// Update record
const update = async (table, id, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');

  const text = `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1`;
  const result = await query(text, [id, ...values]);
  return result.rowCount > 0;
};

// Delete record (soft delete if table has is_active column)
const remove = async (table, id, soft = true) => {
  const text = soft
    ? `UPDATE ${table} SET is_active = false, updated_at = NOW() WHERE id = $1`
    : `DELETE FROM ${table} WHERE id = $1`;

  const result = await query(text, [id]);
  return result.rowCount > 0;
};

// Check if record exists
const exists = async (table, id) => {
  const text = `SELECT 1 FROM ${table} WHERE id = $1 AND is_active = true`;
  const result = await query(text, [id]);
  return result.rowCount > 0;
};

// Count records
const count = async (table, where = 'true') => {
  const text = `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`;
  const result = await query(text);
  return parseInt(result.rows[0].count);
};

// Pagination helper
const paginate = async (text, params = [], page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const countText = text.replace(/SELECT .*? FROM/gi, 'SELECT COUNT(*) FROM');

  const [dataResult, countResult] = await Promise.all([
    query(`${text} LIMIT ${limit} OFFSET ${offset}`, params),
    query(countText, params)
  ]);

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
      pages: Math.ceil(countResult.rows[0].count / limit)
    }
  };
};

// Close all connections
const close = async () => {
  await pool.end();
  logger.info('Database connection pool closed');
};

module.exports = {
  pool,
  query,
  transaction,
  getRow,
  getRows,
  getValue,
  insert,
  update,
  remove,
  exists,
  count,
  paginate,
  testConnection,
  close
};