const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';
const JWT_EXPIRE = '24h';
const REFRESH_EXPIRE = '7d';

const generarTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
  const refreshToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: REFRESH_EXPIRE });
  return { accessToken, refreshToken };
};

// Registrar nuevo usuario
const registrarUsuario = async (datos) => {
  const existe = await User.findOne({ usuario: datos.usuario });
  if (existe) throw new Error('El usuario ya existe');

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(datos.password, salt);

  const nuevo = await User.create({
    usuario: datos.usuario,
    password: hashedPassword,
    nombre: datos.nombre,
    empresa: datos.empresa,
    correo: datos.correo,
    prefijo: datos.prefijo,
    telefono: datos.telefono,
    logo: datos.logo,
    colores: datos.colores,
    telegram: datos.telegram
  });

  return { id: nuevo._id, usuario: nuevo.usuario, estado: nuevo.estado };
};

// Login
const loginUsuario = async (usuario, password, res) => {
  const user = await User.findOne({ usuario });
  if (!user) throw new Error('Credenciales incorrectas');

  if (user.estado !== 'APROBADO') {
    const mensajes = {
      'PENDIENTE': 'Cuenta pendiente de aprobación',
      'DESAPROBADO': 'Acceso restringido',
      'EXPULSADO': 'Cuenta expulsada por el administrador'
    };
    throw new Error(mensajes[user.estado] || 'Acceso denegado');
  }

  const passwordValido = await bcrypt.compare(password, user.password);
  if (!passwordValido) throw new Error('Credenciales incorrectas');

  const { accessToken, refreshToken } = generarTokens(user._id);
  user.refreshToken = refreshToken;
  user.ultimoLogin = new Date();
  await user.save();

  // En la función loginUsuario, dentro de res.cookie()
  res.cookie('access_token', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 24 * 60 * 60 * 1000
  });

  res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return {
  id: user._id,
  nombre: user.nombre,
  usuario: user.usuario,
  perfil: user.perfil,
  empresa: user.empresa,
  logo: user.logo,
  colores: user.colores,
  correo: user.correo,
  prefijo: user.prefijo,
  telefono: user.telefono,
  telegram: user.telegram,
  accessToken  // <-- añadimos el token
};
};

// Logout
const logoutUsuario = async (userId, res) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
};
const obtenerPerfil = async (userId) => {
  const user = await User.findById(userId).select('-password -refreshToken');
  if (!user) throw new Error('Usuario no encontrado');
  return user;
};
const expulsarUsuario = async (adminId, usuarioTarget) => {
  const admin = await User.findById(adminId);
  if (!admin || admin.perfil !== 'ADMIN') throw new Error('No autorizado');
  const user = await User.findOne({ usuario: usuarioTarget });
  if (!user) throw new Error('Usuario no encontrado');
  user.estado = 'EXPULSADO';
  user.refreshToken = null;
  await user.save();
  return { mensaje: `Usuario ${usuarioTarget} expulsado exitosamente` };
};
const aprobarUsuario = async (adminId, usuarioTarget) => {
  const admin = await User.findById(adminId);
  if (!admin || admin.perfil !== 'ADMIN') throw new Error('No autorizado');
  const user = await User.findOne({ usuario: usuarioTarget });
  if (!user) throw new Error('Usuario no encontrado');
  user.estado = 'APROBADO';
  await user.save();
  return { mensaje: `Usuario ${usuarioTarget} aprobado exitosamente` };
};

module.exports = {
  registrarUsuario,
  loginUsuario,
  logoutUsuario,
  obtenerPerfil,
  expulsarUsuario,
  aprobarUsuario
};