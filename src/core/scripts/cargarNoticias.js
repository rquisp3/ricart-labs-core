const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../core/config/db');
const Noticia = require('../../products/sam/models/Noticia');
const datosRaw = require('../../products/sam/data/noticias_historico.json');

const datos = Array.isArray(datosRaw) ? datosRaw : (datosRaw.noticias || datosRaw.data || []);

console.log(`📦 Noticias cargadas desde JSON: ${datos.length}`);
if (datos.length > 0) {
  console.log('🔑 Claves del primer registro:', Object.keys(datos[0]));
}

// Función de parseo robusta que cubre los formatos más comunes
const parseFecha = (raw) => {
  // Caso 1: nulo/indefinido
  if (!raw) {
    console.warn('⚠️ Fecha vacía, usando fecha actual');
    return new Date();
  }
  // Caso 2: ya es Date
  if (raw instanceof Date) return raw;

  // Caso 3: número (timestamp Unix en segundos o milisegundos, o serial de Excel)
  if (typeof raw === 'number') {
    // Si es un número de Excel (menor que 100000, típico 45000-50000 para años 2023-2030)
    if (raw < 100000) {
      const excelEpoch = new Date(1899, 11, 30); // 30 dic 1899
      const date = new Date(excelEpoch.getTime() + raw * 86400000);
      console.log(`🔄 Convertido número Excel ${raw} → ${date.toISOString()}`);
      return date;
    }
    // Timestamp: si es mayor que 1e12, asumir milisegundos, si no, segundos
    const ms = raw > 1e12 ? raw : raw * 1000;
    console.log(`🔄 Convertido timestamp ${raw} → ${new Date(ms).toISOString()}`);
    return new Date(ms);
  }

  // Caso 4: string
  const str = String(raw).trim();
  // Intentar ISO primero
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) {
    console.log(`🔄 Fecha ISO detectada: ${str} → ${isoDate.toISOString()}`);
    return isoDate;
  }

  // Formato "DD/MM/YYYY HH:mm" o "DD/MM/YYYY HH:mm:ss"
  const regex = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const match = str.match(regex);
  if (match) {
    const [_, dd, mm, yyyy, hh, min, ss] = match;
    const year = parseInt(yyyy.length === 2 ? '20' + yyyy : yyyy);
    const date = new Date(year, parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min), parseInt(ss || 0));
    console.log(`🔄 Fecha regex: ${str} → ${date.toISOString()}`);
    return date;
  }

  // Si nada funciona, usar fecha actual y advertir
  console.warn(`⚠️ Formato de fecha no reconocido: "${str}". Se usará la fecha actual.`);
  return new Date();
};

const cargarNoticias = async () => {
  await connectDB();
  console.log('✅ Conectado a MongoDB');

  let insertadas = 0, omitidas = 0;

  for (const row of datos) {
    const url = row.URL || row.url;
    if (!url) {
      console.warn('⚠️ Fila omitida por falta de URL:', row);
      continue;
    }

    try {
      const existe = await Noticia.findOne({ url });
      if (existe) {
        omitidas++;
        continue;
      }

      const fecha = parseFecha(row.FECHA || row.fecha || row.FechaYHora);
      const estado = (row.ESTADO || row.estado || 'PENDIENTE').toUpperCase();

      await Noticia.create({
        url,
        fecha,
        fuente: row.FUENTE || row.fuente || '',
        ambito: row.ÁMBITO || row.ambito || 'PERÚ',
        categoria: row.CATEGORÍA || row.categoria || '',
        titulo: row.TÍTULO || row.titulo || '',
        descripcion: row.DESCRIPCIÓN || row.descripcion || '',
        desarrollo: row.DESARROLLO || row.desarrollo || '',
        estado
      });
      insertadas++;
      console.log(`✅ Noticia insertada: ${row.TÍTULO || row.titulo}`);
    } catch (err) {
      console.warn(`⚠️ Error insertando noticia (${row.TÍTULO || row.titulo}): ${err.message}`);
    }
  }

  console.log(`✅ Noticias insertadas: ${insertadas} | Omitidas (ya existían): ${omitidas}`);
  console.log('🔌 Proceso finalizado.');
  mongoose.disconnect();
};

cargarNoticias().catch(console.error);