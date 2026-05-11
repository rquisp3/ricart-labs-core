const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Intentamos conectar usando la variable de entorno
    const conn = await mongoose.connect(process.env.MONGO_URI);
    
    console.log(`🟢 [MongoDB] Conectado exitosamente al clúster: ${conn.connection.host}`);
  } catch (error) {
    console.error(`🔴 [MongoDB] Error crítico de conexión: ${error.message}`);
    // Si la base de datos no conecta, detenemos el proceso (es vital en producción)
    process.exit(1); 
  }
};

module.exports = connectDB;