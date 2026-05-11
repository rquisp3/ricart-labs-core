const mongoose = require('mongoose');

const sedeSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, index: true },
  sede: { type: String, required: true, trim: true },
  direccion: { type: String, trim: true },
  negocio: { type: String, trim: true },
  perfilCliente: { 
    type: String, 
    trim: true, 
    default: 'DINET'   // ✅ todas las sedes que se creen sin este campo tomarán "DINET"
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }   // [lng, lat]
  }
}, { timestamps: true, versionKey: false });

sedeSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Sede', sedeSchema);