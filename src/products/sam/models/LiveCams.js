const mongoose = require('mongoose');

const liveCamSchema = new mongoose.Schema({
  idCamara: { type: String, required: true, unique: true, index: true },
  ubicacion: { type: String, trim: true },
  distrito: { type: String, trim: true },
  urlStream: { type: String, trim: true },
  latitud: { type: Number },
  longitud: { type: Number },
  proveedor: { type: String, trim: true },
  estado: { type: String, enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('LiveCam', liveCamSchema);