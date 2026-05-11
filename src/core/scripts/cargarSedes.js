const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const Sede = require('../../products/sam/models/Sede');
const sedesRaw = require('../../products/sam/data/sedes.json');

// Permitir que el archivo sea un array o un objeto con array dentro
const sedes = Array.isArray(sedesRaw) ? sedesRaw : (sedesRaw.sedes || sedesRaw.data || []);

console.log(`📦 Sedes cargadas desde JSON: ${sedes.length}`);
if (sedes.length > 0) {
  console.log('🔑 Claves del primer registro:', Object.keys(sedes[0]));
}

const cargarSedes = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI no está definida.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Conectado a MongoDB');

  let insertadas = 0, omitidas = 0;

  for (const s of sedes) {
    const codigo = s.Codigo || s.codigo || s.CODIGO;
    if (!codigo) {
      console.warn('⚠️ Sede omitida por falta de código:', s);
      continue;
    }

    const existe = await Sede.findOne({ codigo: String(codigo).trim() });
    if (existe) {
      omitidas++;
      console.log(`⏩ Sede ${codigo} ya existe. Omitida.`);
      continue;
    }

    // Coordenadas flexibles
    let coords = s.Coordenadas || s.coordenadas || s.COORDENADAS || '';
    if (typeof coords === 'string') {
      const partes = coords.split(',').map(p => parseFloat(p.trim()));
      if (partes.length === 2 && !isNaN(partes[0]) && !isNaN(partes[1])) {
        coords = [partes[1], partes[0]]; // [lng, lat]
      } else {
        coords = [0, 0];
      }
    } else if (Array.isArray(coords) && coords.length >= 2) {
      coords = [coords[1], coords[0]];
    } else {
      coords = [0, 0];
    }

    // Crear sede con perfilCliente "DINET" para todas las de esta carga
    await Sede.create({
      codigo: String(codigo).trim(),
      sede: s.Sede || s.sede || '',
      direccion: s.Direccion || s.direccion || s.DIRECCION || '',
      negocio: s.Negocio || s.negocio || s.NEGOCIO || '',
      perfilCliente: 'DINET',           // ✅ valor fijo para carga histórica
      location: {
        type: 'Point',
        coordinates: coords
      }
    });
    insertadas++;
    console.log(`✅ Sede ${codigo} insertada.`);
  }

  console.log(`✅ Sedes insertadas: ${insertadas} | Omitidas (ya existían): ${omitidas}`);
  await mongoose.disconnect();
};

cargarSedes().catch(console.error);