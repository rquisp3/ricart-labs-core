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

//Exportar PDF
router.post('/exportar-pdf', ctrl.exportarPDF);

router.get('/noticias', ctrl.getNoticiasISSE);
router.get('/noticias/ticker', ctrl.getNoticiasTicker);
router.get('/efemerides', ctrl.getEfemerides);

//version
router.get('/version', ctrl.getVersion);

//LiveCams
router.get('/camaras', ctrl.getCamaras);

//Noticias Ticker
router.get('/noticias/ticker', ctrl.getTicker);

module.exports = router;