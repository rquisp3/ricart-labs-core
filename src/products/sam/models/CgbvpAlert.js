const mongoose = require('mongoose');

const cgbvpAlertSchema = new mongoose.Schema({
  nroParte: { 
    type: String, 
    required: true, 
    unique: true, // Evita duplicados (funciona como la llave primaria del scraper)
    index: true 
  },
  fechaHora: { 
    type: Date, 
    required: true,
    index: -1 // Indexado descendentemente para traer las últimas rápidamente
  },
  tipoEmergencia: { 
    type: String, 
    required: true, 
    trim: true,
    uppercase: true
  },
  estado: { 
    type: String, 
    trim: true, 
    default: 'ATENDIENDO' 
  },
  direccion: { 
    type: String, 
    trim: true 
  },
  location: {
    type: { 
      type: String, 
      enum: ['Point'], 
      default: 'Point' 
    },
    // Si falla el scraper y no trae lat/lon, no rompe el guardado
    coordinates: { type: [Number] } 
  },
  // REFACTORIZACIÓN: Pasamos de "M-14, RES-2" a ["M-14", "RES-2"]
  maquinas: [{ 
    type: String, 
    trim: true 
  }]
}, { 
  timestamps: true, 
  versionKey: false 
});

cgbvpAlertSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('CgbvpAlert', cgbvpAlertSchema);