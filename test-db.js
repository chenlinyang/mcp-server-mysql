import mysql from 'mysql2/promise';

async function testConnection() {
  try {
    console.log('Attempting to connect to MySQL...');
    
    // Connection configuration
    const config = {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE
    };
    
    console.log('Connection config:', {
      ...config,
      password: config.password ? '******' : 'not set'
    });
    
    // Create connection pool
    const pool = mysql.createPool(config);
    
    // Test connection
    const connection = await pool.getConnection();
    console.log('Connection successful!');
    
    // Get server info
    const [rows] = await connection.query('SELECT VERSION() as version');
    console.log('MySQL Version:', rows[0].version);
    
    // Release connection
    connection.release();
    
    // Close pool
    await pool.end();
    console.log('Connection pool closed');
  } catch (error) {
    console.error('Error connecting to MySQL:', error);
  }
}

testConnection();
