require('dotenv').config(); // Carga las variables del .env
const express = require('express');
const connectDB = require('./src/core/config/db'); // Importamos la conexión

// 1. Inicializar Express
const app = express();

// 2. Middlewares Globales del Core
app.use(express.json()); // Permite a la API recibir JSON en los body de las peticiones

// 3. Conectar a MongoDB Atlas
connectDB();

// ==========================================
// 4. ENRUTAMIENTO DE PRODUCTOS (DOMINIOS)
// ==========================================

// Health Check (El que ya tienes funcionando para validar que el Core vive)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    marca: 'Ricart Labs Core',
    mensaje: 'Sistemas operativos y en línea.',
    timestamp: new Date()
  });
});

// 🚀 RUTAS DE SAM V5 ACTIVADAS
const samRoutes = require('./src/products/sam/routes/sam.routes');
app.use('/api/v1/sam', samRoutes);

// 🚀 INICIALIZAR SERVICIOS EN SEGUNDO PLANO (CRON JOBS)
const { initSamCrons } = require('./src/products/sam/services/sam.cron.js'); 
initSamCrons();

// ==========================================
// 5. ARRANQUE DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;

// Escuchamos en 0.0.0.0 para que Railway no tenga problemas de ruteo
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Ricart Labs] Core Server ejecutándose en el puerto ${PORT}`);
});