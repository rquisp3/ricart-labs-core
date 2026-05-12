const mongoose = require('mongoose');

const noticiaSchema = new mongoose.Schema({
  url: { type: String },
  fecha: { type: Date },
  fuente: { type: String, trim: true },
  ambito: { type: String, enum: ['PERÚ', 'REGIÓN', 'GLOBAL'], required: true },
  categoria: { type: String, trim: true },
  titulo: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },
  desarrollo: { type: String, trim: true },   // análisis de IA
  estado: { type: String, enum: ['PENDIENTE', 'EN_COLA', 'PROCESADA'], default: 'PENDIENTE' }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('Noticia', noticiaSchema);