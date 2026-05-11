const mongoose = require('mongoose');

const sedeSchema = new mongoose.Schema({
  codigo: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    uppercase: true
  },
  nombre: { 
    type: String, 
    required: true, 
    trim: true 
  },
  direccion: { 
    type: String, 
    trim: true 
  },
  negocio: { 
    type: String, 
    trim: true 
  },
  // REFACTORIZACIÓN: De texto plano a objeto geoespacial nativo
  location: {
    type: { 
      type: String, 
      enum: ['Point'], 
      default: 'Point' 
    },
    coordinates: { 
      type: [Number], // Siempre es [Longitud, Latitud] en MongoDB
      required: true 
    } 
  }
}, { 
  timestamps: true, 
  versionKey: false 
});

// Índice geoespacial 2dsphere vital para mapas
sedeSchema.index({ location: '2dsphere' }); 

module.exports = mongoose.model('Sede', sedeSchema);