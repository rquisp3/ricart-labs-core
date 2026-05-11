const mongoose = require('mongoose');

const igpAlertSchema = new mongoose.Schema({
  idReporte: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  fechaHora: { 
    type: Date, 
    required: true,
    index: -1 // Orden rápido desde el más reciente
  },
  magnitud: { 
    type: Number, 
    required: true 
  },
  profundidad: { type: String, trim: true },
  intensidad: { type: String, trim: true },
  referencia: { type: String, trim: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [Longitud, Latitud]
  }
}, { timestamps: true, versionKey: false });

// Índice geoespacial
igpAlertSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('IgpAlert', igpAlertSchema);