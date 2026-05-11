const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const IgpAlert = require('../../products/sam/models/IgpAlert');
const datosRaw = require('../../products/sam/data/igp_historico.json');

// Si el archivo es un objeto con array dentro, lo extraemos
const datos = Array.isArray(datosRaw) ? datosRaw : (datosRaw.sismos || datosRaw.data || []);

console.log(`📦 Registros cargados desde JSON: ${datos.length}`);
if (datos.length > 0) {
  console.log('🔑 Claves del primer registro:', Object.keys(datos[0]));
}

// Convierte un número serial de Excel a fecha JavaScript
const serialToDate = (serial) => {
  if (typeof serial === 'number') {
    // La fecha base de Excel es el 1 de enero de 1900, pero con ajuste de 2 días
    return new Date((serial - 25569) * 86400 * 1000);
  }
  // Si no es número, intentamos parsear string
  return new Date(serial);
};

const cargarIGP = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI no está definida.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Conectado a MongoDB');

  let insertados = 0, omitidos = 0;

  for (const row of datos) {
    // Buscar el ID en las claves que aparecen en el objeto real
    const idReporte = row.IDReporte || row['ID Reporte'] || row.idReporte || row.ID || row.id || row.codigo;
    if (!idReporte) {
      console.warn('⚠️ Fila omitida por falta de ID:', row);
      continue;
    }

    const existe = await IgpAlert.findOne({ idReporte: String(idReporte).trim() });
    if (existe) {
      omitidos++;
      continue;
    }

    // Manejo de fecha (puede ser número Excel o string)
    const fechaRaw = row.FechaYHora || row['Fecha y Hora'] || row.fechaHora || row.fecha;
    const fecha = fechaRaw ? serialToDate(fechaRaw) : new Date();

    const lat = parseFloat(row.Latitud || row.latitud || row.lat);
    const lng = parseFloat(row.Longitud || row.longitud || row.lng || row.lon);

    await IgpAlert.create({
      idReporte: String(idReporte).trim(),
      fechaHora: fecha,
      magnitud: parseFloat(row.Magnitud || row.magnitud || row.mag) || 0,
      profundidad: row.Profundidad || row.profundidad || '-',
      intensidad: row.Intensidad || row.intensidad || 'No reportada',
      referencia: row.Referencia || row.referencia || 'No reportada',
      location: {
        type: 'Point',
        coordinates: [lng, lat]
      }
    });
    insertados++;
  }

  console.log(`✅ IGP históricos: ${insertados} insertados, ${omitidos} ya existían.`);
  await mongoose.disconnect();
};

cargarIGP().catch(console.error);