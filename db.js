const { Pool } = require('pg');

const pool = new Pool({
  user: 'ezzah',
  host: 'localhost',
  database: 'erp_integration',
  password: 'afm01',
  port: 5432,
});

// // Test connection
// pool.query('SELECT NOW()', (err, res) => {
//   if (err) {
//     console.error('❌ Connection error:', err);
//   } else {
//     console.log('✅ Connected to DB. Server time is:', res.rows[0].now);
//   }
//   pool.end(); // close after test
// });

module.exports = pool;
