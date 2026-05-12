const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../core/config/db'); // tu conexión robusta
const Efemeride = require('../../products/sam/models/Efemeride');
const datosRaw = require('../../products/sam/data/efemerides_historico.json');

const datos = Array.isArray(datosRaw) ? datosRaw : (datosRaw.efemerides || datosRaw.data || []);

console.log(`📅 Efemérides cargadas desde JSON: ${datos.length}`);
if (datos.length > 0) {
  console.log('🔑 Claves del primer registro:', Object.keys(datos[0]));
}

const cargarEfemerides = async () => {
  await connectDB();
  console.log('✅ Conectado a MongoDB');

  let insertadas = 0, omitidas = 0;

  for (const row of datos) {
    // Buscar clave primaria natural: combinación de mes + regla + titulo
    const mes = (row.MES || row.mes || '').toLowerCase().trim();
    const reglaDia = (row.REGLA_DIA || row.reglaDia || '').trim();
    const titulo = (row.TITULO || row.titulo || '').trim();

    if (!mes || !reglaDia || !titulo) {
      console.warn('⚠️ Fila omitida por falta de MES, REGLA_DIA o TITULO:', row);
      continue;
    }

    try {
      const existe = await Efemeride.findOne({ mes, reglaDia, titulo });
      if (existe) {
        omitidas++;
        continue;
      }

      await Efemeride.create({
        mes,
        reglaDia,
        titulo,
        motivo: row.MOTIVO || row.motivo || '',
        fechaExacta: row.FECHA_EXACTA || row.fechaExacta || ''
      });
      insertadas++;
      console.log(`✅ Efeméride insertada: ${titulo}`);
    } catch (err) {
      console.warn(`⚠️ Error insertando efeméride (${titulo}): ${err.message}`);
    }
  }

  console.log(`✅ Efemérides insertadas: ${insertadas} | Omitidas (ya existían): ${omitidas}`);
  console.log('🔌 Proceso finalizado.');
};

cargarEfemerides().catch(console.error);