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

// Endpoint de diagnóstico – ELIMINAR DESPUÉS DE PROBAR
router.post('/debug-registro', async (req, res) => {
  try {
    const authService = require('../services/authService');
    const resultado = await authService.registrarUsuario({
      usuario: 'debuguser',
      password: 'debugpass',
      nombre: 'Debug User'
    });
    res.json({ success: true, resultado });
  } catch (error) {
    // Devolver el mensaje y el stack completos para ver la causa exacta
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;