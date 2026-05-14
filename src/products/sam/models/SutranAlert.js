const mongoose = require('mongoose');

const sutranAlertSchema = new mongoose.Schema({
  idAlerta: { type: String, required: true, unique: true, index: true },
  fechaInicio: { type: Date, required: true },          // fecha + hora de captura en UTC
  tipoAlerta: { type: String, trim: true },             // ej. 'VIGENTE'
  estado: { type: String, trim: true },                 // ej. 'TRANSITO NORMAL'
  evento: { type: String, trim: true },                 // ej. 'DESLIZAMIENTO DE PIEDRAS Y ROCAS'
  ubigeo: { type: String, trim: true },
  ubicacion: { type: String, trim: true },              // concatenación de carretera + afectación + código vía
  fuente: { type: String, trim: true },
  motivo: { type: String, trim: true },
  codigoVia: { type: String, trim: true },
  nombreCarretera: { type: String, trim: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }                     // [longitud, latitud]
  }
}, { timestamps: true, versionKey: false });

sutranAlertSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SutranAlert', sutranAlertSchema);