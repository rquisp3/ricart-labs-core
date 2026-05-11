const mongoose = require('mongoose');

const dicapiPortSchema = new mongoose.Schema({
  idPuerto: { type: String, required: true, unique: true, index: true },
  puerto: { type: String, required: true, trim: true },
  capitania: { type: String, trim: true },
  nivel: { type: String, trim: true }, // Ej: "Marítimo", "Fluvial"
  estadoLogistico: { 
    type: String, 
    enum: ['ABIERTO', 'CERRADO', 'RESTRINGIDO', 'DESCONOCIDO'],
    default: 'DESCONOCIDO'
  },
  fechaReporte: { type: Date },
  resolucionMgp: { type: String, trim: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }
  }
}, { timestamps: true, versionKey: false });

dicapiPortSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('DicapiPort', dicapiPortSchema);