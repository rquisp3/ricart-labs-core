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

// 3. Tus Rutas
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    database: 'connected',
    message: 'Ricart Labs API está operando',
  });
});