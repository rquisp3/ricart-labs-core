const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const LiveCam = require('../../products/sam/models/LiveCams');
const camsRaw = require('../../products/sam/data/livecams.json');

// Permitir que el archivo sea un array o un objeto con propiedad "camaras" o "data"
const cams = Array.isArray(camsRaw) ? camsRaw : (camsRaw.camaras || camsRaw.data || []);

console.log(`📦 Cámaras cargadas desde JSON: ${cams.length}`);
if (cams.length > 0) {
  console.log('🔑 Claves del primer registro:', Object.keys(cams[0]));
}

const cargarCams = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI no está definida.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Conectado a MongoDB');

  let insertadas = 0, omitidas = 0;

  for (const c of cams) {
    const id = c.ID_CAMARA || c.idCamara || c.ID || c.id;
    if (!id) {
      console.warn('⚠️ Cámara omitida por falta de ID:', c);
      continue;
    }

    const existe = await LiveCam.findOne({ idCamara: String(id).trim() });
    if (existe) {
      omitidas++;
      console.log(`⏩ Cámara ${id} ya existe. Omitida.`);
      continue;
    }

    // Estado: aceptar variantes y asegurar que esté en el enum
    let estado = (c.ESTADO || c.estado || 'ACTIVO').toUpperCase().trim();
    if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
      console.warn(`⚠️ Estado "${estado}" no válido para cámara ${id}. Se usará "ACTIVO".`);
      estado = 'ACTIVO';
    }

    await LiveCam.create({
      idCamara: String(id).trim(),
      ubicacion: c.UBICACION || c.ubicacion || '',
      distrito: c.DISTRITO || c.distrito || '',
      urlStream: c.URL_STREAM || c.urlStream || '',
      latitud: parseFloat(c.LATITUD || c.latitud) || 0,
      longitud: parseFloat(c.LONGITUD || c.longitud) || 0,
      proveedor: c.PROVEEDOR || c.proveedor || '',
      estado
    });
    insertadas++;
    console.log(`✅ Cámara ${id} insertada.`);
  }

  console.log(`✅ Cámaras insertadas: ${insertadas} | Omitidas (ya existían): ${omitidas}`);
  await mongoose.disconnect();
};

cargarCams().catch(console.error);