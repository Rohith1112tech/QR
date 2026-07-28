import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('\x1b[33m%s\x1b[0m', '⚠️ WARNING: MONGODB_URI environment variable is missing.');
    console.warn('\x1b[33m%s\x1b[0m', '   Running in LOCAL FALLBACK mode (using local JSON file database.json).');
    return false;
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    console.error('⚠️ Falling back to local JSON database due to connection error.');
    return false;
  }
}
