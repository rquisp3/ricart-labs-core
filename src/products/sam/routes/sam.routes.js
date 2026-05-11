const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/alertasController');

// Ruta raíz de SAM: datos completos
router.get('/alertas/todas', ctrl.getAlertasCompletas);

// Rutas individuales
router.get('/alertas/sismos', ctrl.getSismos);
router.get('/alertas/carreteras', ctrl.getCarreteras);
router.get('/alertas/bomberos', ctrl.getBomberos);
router.get('/alertas/puertos', ctrl.getPuertos);
router.get('/alertas/sedes', ctrl.getSedes);

//test
router.get('/ping', (req, res) => res.json({ ping: 'ok' }));

// CECOM (registro manual)
router.post('/cecom/registrar', ctrl.registrarCecom);

module.exports = router;