const axios = require('axios');
const IgpAlert = require('../../models/IgpAlert');

// ------------------------------------------------------
// Scraper de Sismos IGP – Primera carga completa, luego incremental
// ------------------------------------------------------
const syncIgp = async () => {
  console.log('📡 [IGP] Iniciando sincronización...');
  try {
    const anio = new Date().getFullYear();
    const url = `https://ultimosismo.igp.gob.pe/api/ultimo-sismo/ajaxb/${anio}`;

    const { data } = await axios.get(url, {
      headers: {
        accept: '*/*',
        'accept-language': 'es-419,es-US;q=0.9,es;q=0.8',
        referrer: 'https://ultimosismo.igp.gob.pe/ultimo-sismo',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });

    if (!Array.isArray(data)) {
      console.warn('⚠️ [IGP] El endpoint no devolvió un array válido.');
      return;
    }

    console.log(`📋 [IGP] Sismos recibidos del año ${anio}: ${data.length}`);

    // 1. Obtener el último código registrado (si existe)
    const ultimoRegistro = await IgpAlert.findOne()
      .sort({ idReporte: -1 })
      .select('idReporte')
      .lean();

    let ultimoCorrelativo = 0;
    if (ultimoRegistro && ultimoRegistro.idReporte) {
      const partes = ultimoRegistro.idReporte.split('-');
      if (partes.length === 2) {
        ultimoCorrelativo = parseInt(partes[1], 10);
        console.log(`ℹ️ [IGP] Último código en BD: ${ultimoRegistro.idReporte} (correlativo ${ultimoCorrelativo})`);
      }
    } else {
      console.log('ℹ️ [IGP] Colección vacía. Se realizará carga inicial de los últimos 50 sismos.');
    }

    // 2. Filtrar sismos nuevos (o todos si está vacía)
    let nuevosSismos;
    if (ultimoCorrelativo === 0) {
      // Sin registros previos: tomar los últimos 50 del array (orden descendente por código)
      const sismosOrdenados = [...data]
        .filter(s => s.codigo)
        .sort((a, b) => {
          const numA = parseInt(a.codigo.split('-')[1], 10) || 0;
          const numB = parseInt(b.codigo.split('-')[1], 10) || 0;
          return numB - numA; // descendente
        });
      nuevosSismos = sismosOrdenados.slice(0, 50);
    } else {
      // Solo sismos con correlativo mayor al último registrado
      nuevosSismos = data.filter(sismo => {
        if (!sismo.codigo) return false;
        const partes = sismo.codigo.split('-');
        if (partes.length !== 2) return false;
        const correlativo = parseInt(partes[1], 10);
        return correlativo > ultimoCorrelativo;
      });
    }

    console.log(`🆕 [IGP] Sismos a insertar: ${nuevosSismos.length}`);

    // 3. Insertar los nuevos sismos
    let insertados = 0;
    for (const sismo of nuevosSismos) {
      try {
        const codigo = String(sismo.codigo).trim();

        // Combinar fecha y hora UTC
        let fecha = new Date();
        if (sismo.fecha_utc && sismo.hora_utc) {
          const fechaBase = new Date(sismo.fecha_utc);
          const hora = new Date(sismo.hora_utc);
          if (!isNaN(fechaBase.getTime()) && !isNaN(hora.getTime())) {
            fecha = new Date(Date.UTC(
              fechaBase.getUTCFullYear(),
              fechaBase.getUTCMonth(),
              fechaBase.getUTCDate(),
              hora.getUTCHours(),
              hora.getUTCMinutes(),
              hora.getUTCSeconds()
            ));
          }
        } else if (sismo.fecha_utc) {
          fecha = new Date(sismo.fecha_utc);
        }

        const lat = parseFloat(sismo.latitud) || 0;
        const lng = parseFloat(sismo.longitud) || 0;

        let intensidad = 'No reportada';
        if (sismo.intensidad) {
          const str = String(sismo.intensidad).trim();
          if (str !== '' && !str.toLowerCase().includes('no evaluar') && str !== 'null') {
            intensidad = str;
          }
        }

        const magnitud = parseFloat(sismo.magnitud) || 0;
        const profundidad = sismo.profundidad != null ? `${sismo.profundidad}km` : '-';
        const referencia = sismo.referencia ? String(sismo.referencia).trim() : 'No reportada';

        await IgpAlert.create({
          idReporte: codigo,
          fechaHora: fecha,
          magnitud,
          profundidad,
          intensidad,
          referencia,
          location: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        });

        insertados++;
        console.log(`🟢 [IGP] Insertado: ${codigo} – M${magnitud} en ${referencia}`);
      } catch (innerError) {
        console.error(`🔴 [IGP] Error insertando sismo ${sismo.codigo}: ${innerError.message}`);
      }
    }

    console.log(`✅ [IGP] Sincronización completada. Insertados: ${insertados}`);

    // 4. Mantener solo los últimos 50 sismos (por fechaHora descendente)
    const total = await IgpAlert.countDocuments();
    const MAX_REGISTROS = 25;
    if (total > MAX_REGISTROS) {
      const excedentes = total - MAX_REGISTROS;
      // Conservar los 50 más recientes (orden descendente por fechaHora)
      const antiguos = await IgpAlert.find()
        .sort({ fechaHora: 1 })   // más viejos primero
        .limit(excedentes)
        .select('_id');
      
      const idsParaBorrar = antiguos.map(doc => doc._id);
      await IgpAlert.deleteMany({ _id: { $in: idsParaBorrar } });
      console.log(`🧹 [IGP] Se eliminaron ${idsParaBorrar.length} sismos antiguos. Total actual: ${MAX_REGISTROS}`);
    }
  } catch (error) {
    console.error(`🔴 [IGP] Error crítico: ${error.message}`);
  }
};

module.exports = syncIgp;