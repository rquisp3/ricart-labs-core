const express = require('express');
const router = express.Router();
const alertasController = require('../controllers/alertasController');

// Ruta GET para el resumen del dashboard
// Al acceder a esta ruta, se ejecuta el controlador que creamos arriba
router.get('/dashboard', alertasController.getDashboardSummary);

module.exports = router;