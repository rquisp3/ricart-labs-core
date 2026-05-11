const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`🟢 [MongoDB] Conectado exitosamente al clúster: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`🔴 [MongoDB] Error crítico de conexión: ${error.message}`);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ [MongoDB] Se ha perdido la conexión. Reintentando...');
  });
};

module.exports = connectDB;