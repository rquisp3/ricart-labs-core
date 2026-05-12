const jwt = require('jsonwebtoken');
const User = require('../../products/sam/models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

// Middleware que protege rutas: verifica token desde cookies
const proteger = async (req, res, next) => {
  try {
    let token = req.cookies?.access_token;

    // 🔥 NUEVO: aceptar token por header
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Acceso denegado. Inicia sesión.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    if (user.estado !== 'APROBADO') {
      return res.status(403).json({
        success: false,
        message: 'Cuenta no aprobada o expulsada'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado'
    });
  }
};

// Middleware que restringe acceso según roles
const restringir = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.perfil)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para esta acción'
      });
    }
    next();
  };
};

module.exports = { proteger, restringir };