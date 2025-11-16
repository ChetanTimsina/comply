const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

// SQLite database configuration
const dbPath = path.join(__dirname, '../../bhutan_bus_system.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Database connection failed:', err.message);
  } else {
    logger.info('Connected to SQLite database');
  }
});

// Test database connection
const testConnection = () => {
  return new Promise((resolve) => {
    db.get('SELECT 1 as test', (err, row) => {
      if (err) {
        logger.error('Database connection failed:', err.message);
        resolve(false);
      } else {
        logger.info('Database connection successful');
        resolve(true);
      }
    });
  });
};

// Execute query with error handling
const query = (text, params = []) => {
  return new Promise((resolve, reject) => {
    // Handle different query types
    if (text.trim().startsWith('SELECT') || text.trim().startsWith('select')) {
      if (text.includes('RETURNING')) {
        // Handle INSERT with RETURNING
        db.all(text, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve({ rows });
          }
        });
      } else {
        // Regular SELECT
        db.all(text, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve({ rows });
          }
        });
      }
    } else if (text.trim().startsWith('INSERT') || text.trim().startsWith('insert')) {
      db.run(text, params, function(err) {
        if (err) {
          reject(err);
        } else {
          if (text.includes('RETURNING')) {
            // For INSERT RETURNING, get the inserted row
            const insertId = this.lastID;
            db.get(`SELECT * FROM users WHERE id = ${insertId}`, (err, row) => {
              if (err) {
                reject(err);
              } else {
                resolve({ rows: [row] });
              }
            });
          } else {
            resolve({ rows: [] });
          }
        }
      });
    } else {
      // For UPDATE, DELETE, etc.
      db.run(text, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ rows: [], rowCount: this.changes });
        }
      });
    }
  });
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
  const row = await getRow(text, params);
  return row ? Object.values(row)[0] : null;
};

// Insert record and return ID
const insert = async (table, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');

  const text = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

  return new Promise((resolve, reject) => {
    db.run(text, values, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
};

// Update record
const update = async (table, id, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((key) => `${key} = ?`).join(', ');

  const text = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  const result = await query(text, [...values, id]);
  return result.rowCount > 0;
};

// Delete record
const remove = async (table, id, soft = true) => {
  if (soft) {
    const text = `UPDATE ${table} SET is_active = 0 WHERE id = ?`;
    const result = await query(text, [id]);
    return result.rowCount > 0;
  } else {
    const text = `DELETE FROM ${table} WHERE id = ?`;
    const result = await query(text, [id]);
    return result.rowCount > 0;
  }
};

// Check if record exists
const exists = async (table, id) => {
  const text = `SELECT 1 FROM ${table} WHERE id = ? AND is_active = 1`;
  const result = await query(text, [id]);
  return result.rows.length > 0;
};

// Count records
const count = async (table, where = '1=1') => {
  const text = `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`;
  const result = await query(text);
  return result.rows[0].count;
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
      total: countResult.rows[0].count,
      pages: Math.ceil(countResult.rows[0].count / limit)
    }
  };
};

// Close database connection
const close = () => {
  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        logger.error('Error closing database:', err.message);
      } else {
        logger.info('Database connection closed');
      }
      resolve();
    });
  });
};

// Initialize database connection
const connectDB = async () => {
  await testConnection();
  return db;
};

module.exports = {
  query,
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
  close,
  connectDB,
  db
};