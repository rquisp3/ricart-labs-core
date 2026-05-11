require('dotenv').config(); // Carga las variables del .env
const express = require('express');
const cookieParser = require('cookie-parser');
const connectDB = require('./src/core/config/db'); // Importamos la conexión

// 1. Inicializar Express
const app = express();

// 2. Middlewares Globales del Core
app.use(express.json()); // Permite a la API recibir JSON en los body de las peticiones
app.use(cookieParser());

// 3. Conectar a MongoDB Atlas
connectDB()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('No se pudo conectar a MongoDB', err);
    process.exit(1);
  });

// ==========================================
// 4. ENRUTAMIENTO DE PRODUCTOS (DOMINIOS)
// ==========================================

// Montar rutas de SAM (alertas)
const samRoutes = require('./src/products/sam/routes/sam.routes');
app.use('/api/v1/sam', samRoutes);
console.log('✅ Rutas SAM montadas');

// Montar rutas de autenticación
const authRoutes = require('./src/products/sam/routes/auth.routes');
app.use('/api/v1/auth', authRoutes);
console.log('✅ Rutas Auth montadas');

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'success', marca: 'Ricart Labs Core', timestamp: new Date() });
});

// Iniciar cron jobs
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