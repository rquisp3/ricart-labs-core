const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  usuario: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  estado: {
    type: String,
    enum: ['PENDIENTE', 'APROBADO', 'DESAPROBADO', 'EXPULSADO'],
    default: 'PENDIENTE'
  },
  perfil: {
    type: String,
    enum: ['ADMIN', 'USER', 'VISITOR'],
    default: 'VISITOR'
  },
  empresa: { type: String, trim: true },
  logo: { type: String, trim: true },
  colores: { type: String, trim: true },
  correo: { type: String, trim: true, lowercase: true },
  prefijo: { type: String, trim: true },
  telefono: { type: String, trim: true },
  telegram: { type: String, trim: true },
  refreshToken: { type: String },
  ultimoLogin: { type: Date }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('User', userSchema);