require('dotenv').config(); // Carga las variables secretas del archivo .env
const express = require('express');
const mongoose = require('mongoose'); // Importamos Mongoose

const app = express();
const port = process.env.PORT || 3000;

// Permite que Express entienda los datos en formato JSON
app.use(express.json()); 

// 1. Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('🟢 Conectado exitosamente a MongoDB Atlas');
    
    // 2. Encendemos el servidor SOLO si hay base de datos
    app.listen(port, () => {
      console.log(`🚀 Servidor de Ricart Labs corriendo en el puerto ${port}`);
    });
  })
  .catch((error) => {
    console.error('🔴 Error conectando a la base de datos:', error);
  });

// 3. Tus Rutas (Health Check)
app.get('/', (req, res) => {
  // mongoose.connection.readyState devuelve: 
  // 0 = desconectado, 1 = conectado, 2 = conectando, 3 = desconectando
  const dbState = mongoose.connection.readyState;
  const dbStatusMessage = dbState === 1 ? 'Conectado a Atlas 🟢' : 'Desconectado 🔴';

  res.json({
    empresa: 'Ricart Labs',
    api_status: 'online 🚀',
    database_status: dbStatusMessage,
    message: 'Todos los sistemas operativos',
    timestamp: new Date().toISOString()
  });
});