const axios = require('axios');
const SutranAlert = require('../../models/SutranAlert');

// ------------------------------------------------------
// Helper para combinar fecha (YYYY-MM-DD) con hora de captura en UTC
// ------------------------------------------------------
const combinarFechaHoraUTC = (fechaStr) => {
  if (!fechaStr) return new Date();
  const match = String(fechaStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date();   // fallback

  const [_, yyyy, mm, dd] = match;
  const ahora = new Date();        // hora actual del servidor (UTC si está configurado así)
  return new Date(Date.UTC(
    parseInt(yyyy), parseInt(mm) - 1, parseInt(dd),
    ahora.getUTCHours(), ahora.getUTCMinutes(), ahora.getUTCSeconds()
  ));
};

// ------------------------------------------------------
// Scraper de SUTRAN – Nuevo endpoint oficial y modelo ampliado
// ------------------------------------------------------
const syncSutran = async () => {
  console.log('🛣️ [SUTRAN] Radar escaneando estado de vías...');
  try {
    const url = 'https://gis.sutran.gob.pe/mapa_interactivo_alertas/carga_xlsx.php';
    const respuesta = await axios.post(url, 'tipo=MAPA', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-419,es;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    const data = respuesta.data;

    // Unificar las tres categorías (normal, restringido, interrumpido)
    const categorias = ['normal', 'restringido', 'interrumpido'];
    let todasLasAlertas = [];
    categorias.forEach(cat => {
      if (data[cat] && Array.isArray(data[cat])) {
        todasLasAlertas = todasLasAlertas.concat(data[cat]);
      }
    });

    if (todasLasAlertas.length === 0) {
      console.log('⚪ [SUTRAN] No se detectaron alertas activas en este momento.');
      return;
    }

    console.log(`📋 [SUTRAN] Total de puntos detectados: ${todasLasAlertas.length}`);

    let nuevas = 0;
    let yaExistentes = 0;

    for (const marcador of todasLasAlertas) {
      // El objeto puede venir directamente con los campos o dentro de "properties"
      const prop = marcador.properties || marcador;

      // Coordenadas
      let lat = parseFloat(prop.latitud || prop.LATITUD || prop.lat);
      let lng = parseFloat(prop.longitud || prop.LONGITUD || prop.lon);
      if ((isNaN(lat) || isNaN(lng)) && marcador.geometry && marcador.geometry.coordinates) {
        lng = parseFloat(marcador.geometry.coordinates[0]);
        lat = parseFloat(marcador.geometry.coordinates[1]);
      }

      // Datos para el identificador único (hash)
      const coordStr = (!isNaN(lat) && !isNaN(lng)) ? `${lat}, ${lng}` : 'SIN_COORDS';
      const fechaEvento = prop.fecha_evento || '';
      const carretera = prop.nombre_carretera || '';
      const semilla = coordStr + fechaEvento + carretera;

      let hash = 0;
      for (let i = 0; i < semilla.length; i++) {
        const char = semilla.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const idVirtual = `SUT-${Math.abs(hash)}`;

      const existe = await SutranAlert.findOne({ idAlerta: idVirtual });
      if (existe) {
        yaExistentes++;
        continue;
      }

      // Fecha combinada (fecha del evento + hora de captura en UTC)
      const fechaInicio = combinarFechaHoraUTC(fechaEvento);

      // Campos según el nuevo modelo
      const nuevaAlerta = {
        idAlerta: idVirtual,
        fechaInicio,
        tipoAlerta: prop.tipo_alerta_ || '',
        estado: prop.estado || '',
        evento: prop.evento || '',
        ubigeo: prop.ubigeo || '',
        ubicacion: `${prop.nombre_carretera || ''} ${prop.afectacion || ''} ${prop.codigo_via || ''}`.trim(),
        fuente: prop.fuente || '',
        motivo: prop.motivo || '',
        codigoVia: prop.codigo_via || '',
        nombreCarretera: prop.nombre_carretera || ''
      };

      if (!isNaN(lat) && !isNaN(lng)) {
        nuevaAlerta.location = {
          type: 'Point',
          coordinates: [lng, lat]
        };
      }

      await SutranAlert.create(nuevaAlerta);
      nuevas++;
    }

    console.log(`🟢 [SUTRAN] Sincronización completada. Nuevas: ${nuevas} | Ya existentes: ${yaExistentes}`);

    // Límite máximo de registros (2000)
    const MAX_REGISTROS = 2000;
    const total = await SutranAlert.countDocuments();
    if (total > MAX_REGISTROS) {
      const excedentes = total - MAX_REGISTROS;
      const antiguos = await SutranAlert.find()
        .sort({ fechaInicio: 1 })
        .limit(excedentes)
        .select('_id');
      const idsParaBorrar = antiguos.map(doc => doc._id);
      await SutranAlert.deleteMany({ _id: { $in: idsParaBorrar } });
      console.log(`🧹 [SUTRAN] Se eliminaron ${idsParaBorrar.length} alertas antiguas para mantener el límite de ${MAX_REGISTROS}.`);
    }

  } catch (error) {
    console.error(`🔴 [SUTRAN] Error crítico: ${error.message}`);
  }
};

module.exports = syncSutran;