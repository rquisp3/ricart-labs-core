const mongoose = require('mongoose');

const sutranAlertSchema = new mongoose.Schema({
  idAlerta: { type: String, required: true, unique: true, index: true },
  fechaInicio: { type: Date, required: true },
  via: { type: String, trim: true },
  sentido: { type: String, trim: true },
  kilometro: { type: String, trim: true },
  restriccion: { type: String, trim: true }, // Ej: "Paso alterno", "Bloqueo total"
  tipoEvento: { type: String, trim: true }, // Ej: "Factor Climatológico", "Huelga"
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    // A veces Sutran no da coordenadas exactas, por lo que no lo hacemos required
    coordinates: { type: [Number] } 
  }
}, { timestamps: true, versionKey: false });

sutranAlertSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SutranAlert', sutranAlertSchema);