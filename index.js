require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); 

// 1. Conectamos a MongoDB, pero no detenemos el servidor si falla
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Conectado exitosamente a MongoDB Atlas'))
  .catch((error) => console.error('🔴 Error conectando a MongoDB:', error.message));

// 2. El servidor web SIEMPRE arranca
app.listen(port, () => {
  console.log(`🚀 Servidor de Ricart Labs corriendo en el puerto ${port}`);
});

// 3. Tu Health Check a prueba de balas
app.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  let dbStatusMessage = 'Desconectado 🔴';
  if (dbState === 1) dbStatusMessage = 'Conectado a Atlas 🟢';
  if (dbState === 2) dbStatusMessage = 'Conectando... 🟡';

  res.json({
    empresa: 'Ricart Labs',
    api_status: 'online 🚀',
    database_status: dbStatusMessage,
    message: 'Todos los sistemas operativos',
    timestamp: new Date().toISOString()
  });
});