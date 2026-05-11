const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { proteger, restringir } = require('../../../core/middlewares/authMiddleware');

// Públicas
router.post('/registro', authCtrl.registro);
router.post('/login', authCtrl.login);

// Protegidas
router.post('/logout', proteger, authCtrl.logout);
router.get('/perfil', proteger, authCtrl.perfil);

// Solo ADMIN
router.post('/aprobar', proteger, restringir('ADMIN'), authCtrl.aprobar);
router.post('/expulsar', proteger, restringir('ADMIN'), authCtrl.expulsar);

module.exports = router;