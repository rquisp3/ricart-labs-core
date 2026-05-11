const authService = require('../services/authService');

// POST /auth/registro
const registro = async (req, res) => {
  console.log('📝 [REGISTRO] Body recibido:', JSON.stringify(req.body));
  try {
    // Validación básica
    if (!req.body.usuario || !req.body.password) {
      console.warn('⚠️ [REGISTRO] Faltan campos obligatorios');
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios: usuario y password'
      });
    }

    const resultado = await authService.registrarUsuario(req.body);
    res.status(201).json({
      success: true,
      message: 'Registro exitoso. Espera la aprobación de un administrador.',
      data: resultado
    });
  } catch (error) {
    console.error('❌ [REGISTRO] Error:', error.message);
    console.error('Stack:', error.stack);
    // Diferenciar entre error de validación y error interno
    if (error.message.includes('ya existe')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

// POST /auth/login
const login = async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const userData = await authService.loginUsuario(usuario, password, res);
    res.json({ success: true, data: userData });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

// POST /auth/logout
const logout = async (req, res) => {
  try {
    await authService.logoutUsuario(req.user._id, res);
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /auth/perfil
const perfil = async (req, res) => {
  try {
    const user = await authService.obtenerPerfil(req.user._id);
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

// POST /auth/expulsar (ADMIN)
const expulsar = async (req, res) => {
  try {
    const resultado = await authService.expulsarUsuario(req.user._id, req.body.usuario);
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(403).json({ success: false, message: error.message });
  }
};

// POST /auth/aprobar (ADMIN)
const aprobar = async (req, res) => {
  try {
    const resultado = await authService.aprobarUsuario(req.user._id, req.body.usuario);
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(403).json({ success: false, message: error.message });
  }
};

module.exports = { registro, login, logout, perfil, expulsar, aprobar };