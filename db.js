const { Pool } = require('pg');

const pool = new Pool({
  user: 'ezzah',
  host: 'localhost',
  database: 'erp_integration',
  password: 'afm01',
  port: 5432,
});

module.exports = pool;
