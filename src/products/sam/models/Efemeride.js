const mongoose = require('mongoose');

const efemerideSchema = new mongoose.Schema({
  mes: { type: String, required: true },
  reglaDia: { type: String, required: true },
  titulo: { type: String, required: true },
  motivo: { type: String, trim: true },
  fechaExacta: { type: String, trim: true }  // nuevo campo opcional
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('Efemeride', efemerideSchema);