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

    // Verify/Create Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(15) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        plan VARCHAR(20) DEFAULT 'free',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id VARCHAR(15) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        owner_id VARCHAR(15) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id VARCHAR(15) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id VARCHAR(15) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'editor',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS folders (
        id VARCHAR(15) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        workspace_id VARCHAR(15) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contents (
        short_id VARCHAR(10) PRIMARY KEY,
        type VARCHAR(10) NOT NULL,
        content TEXT,
        media_url VARCHAR(255),
        cloudinary_public_id VARCHAR(100),
        local_file_path VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );

      -- Safe schema updates for existing contents table
      ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_type_check;
      ALTER TABLE contents ADD CONSTRAINT contents_type_check CHECK (type IN ('text', 'image', 'video', 'url'));

      ALTER TABLE contents ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(15) REFERENCES workspaces(id) ON DELETE SET NULL;
      ALTER TABLE contents ADD COLUMN IF NOT EXISTS folder_id VARCHAR(15) REFERENCES folders(id) ON DELETE SET NULL;
      ALTER TABLE contents ADD COLUMN IF NOT EXISTS name VARCHAR(100);
      ALTER TABLE contents ADD COLUMN IF NOT EXISTS created_by VARCHAR(15) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE contents ADD COLUMN IF NOT EXISTS qr_design TEXT;

      CREATE TABLE IF NOT EXISTS scans (
        id VARCHAR(15) PRIMARY KEY,
        short_id VARCHAR(10) NOT NULL REFERENCES contents(short_id) ON DELETE CASCADE,
        scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        browser VARCHAR(50),
        os VARCHAR(50),
        device VARCHAR(50),
        ip VARCHAR(45),
        country VARCHAR(100),
        city VARCHAR(100)
      );
    `);
    
    console.log('✅ PostgreSQL Schema Verified and Migrated');
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
