const axios = require('axios');
const IgpAlert = require('../../models/IgpAlert');

// ------------------------------------------------------
// Scraper de Último Sismo (IGP) – Límite máximo de 20 registros
// ------------------------------------------------------
const syncIgp = async () => {
  console.log('📡 [IGP] Radar escaneando actividad sísmica...');
  try {
    // 1. Infiltración directa (igual que en GAS)
    const { data } = await axios.get(
      'https://ultimosismo.igp.gob.pe/api/ultimo-sismo',
      {
        headers: {
          accept: '*/*',
          'accept-language': 'es-419,es-US;q=0.9,es;q=0.8',
          referrer: 'https://ultimosismo.igp.gob.pe/ultimo-sismo',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      }
    );

    if (!data || !data.codigo) {
      console.warn('⚠️ [IGP] La API no devolvió un código de sismo válido.');
      return;
    }

    const codigo = String(data.codigo).trim();

    // 2. ¿Ya está registrado?
    const existe = await IgpAlert.findOne({ idReporte: codigo });
    if (existe) {
      console.log(`ℹ️ [IGP] El sismo ${codigo} ya estaba registrado. Sin cambios.`);
      return;
    }

    // 3. Parseo de fecha convirtiendo explícitamente a UTC
    //    La API del IGP entrega la fecha en hora peruana (UTC-5) sin zona horaria.
    //    Añadimos '-05:00' para que new Date() la interprete correctamente y la guarde en UTC.
    let fecha = new Date();
    if (data.fecha_hora) {
      const fechaStr = String(data.fecha_hora).trim();
      const fechaConZona = fechaStr.includes('Z') || fechaStr.includes('+') || fechaStr.includes('-') 
        ? fechaStr 
        : fechaStr + '-05:00';
      const f = new Date(fechaConZona);
      if (!isNaN(f.getTime())) fecha = f;
    }

    // 4. Coordenadas
    const lat = parseFloat(data.latitud) || 0;
    const lng = parseFloat(data.longitud) || 0;

    // 5. Limpieza de intensidad (como en GAS)
    let intensidad = 'No reportada';
    if (data.intensidades) {
      const str = String(data.intensidades).trim();
      if (
        str !== '' &&
        !str.toLowerCase().includes('no evaluar') &&
        str !== 'null'
      ) {
        intensidad = str;
      }
    }

    // 6. Magnitud y profundidad
    const magnitud = parseFloat(data.magnitud) || 0;
    const profundidad = data.profundidad
      ? `${data.profundidad}km`
      : '-';

    // 7. Referencia
    const referencia = data.referencia
      ? String(data.referencia).trim()
      : 'No reportada';

    // 8. Insertar en MongoDB
    await IgpAlert.create({
      idReporte: codigo,
      fechaHora: fecha,
      magnitud,
      profundidad,
      intensidad,
      referencia,
      location: {
        type: 'Point',
        coordinates: [lng, lat], // [longitud, latitud]
      },
    });

    console.log(
      `🟢 [IGP] Nuevo sismo registrado: ${codigo} – M${magnitud} en ${referencia}`
    );

    // 9. Mantener solo los últimos 20 sismos
    const total = await IgpAlert.countDocuments();
    const MAX_REGISTROS = 20;
    if (total > MAX_REGISTROS) {
      const excedentes = total - MAX_REGISTROS;
      // Buscar los más antiguos (orden ascendente por fechaHora)
      const antiguos = await IgpAlert.find()
        .sort({ fechaHora: 1 })   // más viejos primero
        .limit(excedentes)
        .select('_id');
      
      const idsParaBorrar = antiguos.map((doc) => doc._id);
      await IgpAlert.deleteMany({ _id: { $in: idsParaBorrar } });
      console.log(`🧹 [IGP] Se eliminaron ${idsParaBorrar.length} sismos antiguos para mantener el límite de 20.`);
    }
  } catch (error) {
    console.error(`🔴 [IGP] Error crítico: ${error.message}`);
  }
};

module.exports = syncIgp;