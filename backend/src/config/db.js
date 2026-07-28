import pg from 'pg';
const { Pool } = pg;

let pool = null;

export async function connectDB() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('\x1b[33m%s\x1b[0m', '⚠️ WARNING: DATABASE_URL environment variable is missing.');
    console.warn('\x1b[33m%s\x1b[0m', '   Running in LOCAL FALLBACK mode (using local JSON file database.json).');
    return false;
  }

  try {
    // Render PostgreSQL requires SSL in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    pool = new Pool({
      connectionString,
      ssl: isProduction ? { rejectUnauthorized: false } : false
    });

    // Test connection
    const client = await pool.connect();
    console.log(`✅ PostgreSQL Connected successfully`);

    // Verify/Create Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS contents (
        short_id VARCHAR(10) PRIMARY KEY,
        type VARCHAR(10) NOT NULL CHECK (type IN ('text', 'image', 'video')),
        content TEXT,
        media_url VARCHAR(255),
        cloudinary_public_id VARCHAR(100),
        local_file_path VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    
    console.log('✅ PostgreSQL Schema Verified (contents table active)');
    client.release();
    return true;
  } catch (error) {
    console.error(`❌ Error connecting to PostgreSQL: ${error.message}`);
    console.warn('⚠️ Falling back to local JSON database due to connection error.');
    pool = null;
    return false;
  }
}

/**
 * Returns the active PG pool
 * @returns {Pool|null}
 */
export function getDBPool() {
  return pool;
}
