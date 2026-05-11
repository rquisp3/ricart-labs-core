const axios = require('axios');
const SutranAlert = require('../../models/SutranAlert');

// ------------------------------------------------------
// Helper para parsear fechas SUTRAN (formato "DD/MM/YYYY HH:MM:SS")
// ------------------------------------------------------
const parsearFechaSutran = (fechaStr) => {
  if (!fechaStr) return new Date();
  const regex = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;
  const match = String(fechaStr).match(regex);
  if (!match) return new Date(); // fallback a ahora
  const [_, dd, mm, yyyy, hh, min, ss] = match;
  return new Date(yyyy, parseInt(mm, 10) - 1, dd, hh, min, ss);
};

// ------------------------------------------------------
// Scraper de SUTRAN – Lógica original de GAS + mejoras Node.js
// ------------------------------------------------------
const syncSutran = async () => {
  console.log('🛣️ [SUTRAN] Radar escaneando estado de vías...');
  try {
    const url = 'http://gis.sutran.gob.pe/alerta_sutran/script_cgm/carga_xlsx.php?tipo=MAPA';
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-419,es;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    // 1. Juntar las tres categorías (normal, restringido, interrumpido)
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
      const prop = marcador.properties || {};

      // Coordenadas (con fallback a geometry)
      let lat = parseFloat(prop.latitud || prop.LATITUD || prop.lat);
      let lon = parseFloat(prop.longitud || prop.LONGITUD || prop.lon);
      if ((isNaN(lat) || isNaN(lon)) && marcador.geometry && marcador.geometry.coordinates) {
        lon = parseFloat(marcador.geometry.coordinates[0]);
        lat = parseFloat(marcador.geometry.coordinates[1]);
      }

      // Generar ID virtual (misma lógica del GAS: hash simple de coordenadas+fecha+carretera)
      const coordStr = `${isNaN(lat) ? '' : lat}, ${isNaN(lon) ? '' : lon}`;
      const fechaEvento = prop.fecha_evento || '';
      const carretera = prop.nombre_carretera || '';
      const semilla = coordStr + fechaEvento + carretera;
      
      // Hash determinista (sin crypto, como el GAS original)
      let hash = 0;
      for (let i = 0; i < semilla.length; i++) {
        const char = semilla.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // convertir a entero de 32 bits
      }
      const idVirtual = `SUT-${Math.abs(hash)}`; // Ej: SUT-14839284

      // ¿Ya existe?
      const existe = await SutranAlert.findOne({ idAlerta: idVirtual });
      if (existe) {
        yaExistentes++;
        continue;
      }

      // Parsear fecha de inicio
      const fechaInicio = fechaEvento ? parsearFechaSutran(fechaEvento) : new Date();

      // Mapeo de campos según el esquema
      const via = carretera || 'Vía no especificada';
      const sentido = prop.sentido || prop.SENTIDO || 'Ambos';
      const kilometro = prop.km || prop.KM || prop.kilometro || 'S/N';
      
      let restriccion = (prop.estado || prop.afectacion || '').toUpperCase().trim();
      if (!restriccion) restriccion = 'INTERRUMPIDO';
      
      const tipoEvento = prop.evento || prop.EVENTO || prop.tipo_evento || 'Incidente en la vía';

      // Construir documento
      const nuevaAlerta = {
        idAlerta: idVirtual,
        fechaInicio,
        via,
        sentido,
        kilometro,
        restriccion,
        tipoEvento,
      };

      // Solo agregar location si hay coordenadas válidas
      if (!isNaN(lat) && !isNaN(lon)) {
        nuevaAlerta.location = {
          type: 'Point',
          coordinates: [lon, lat] // GeoJSON: [longitud, latitud]
        };
      }

      await SutranAlert.create(nuevaAlerta);
      nuevas++;
    }

    console.log(`🟢 [SUTRAN] Sincronización completada. Nuevas: ${nuevas} | Ya existentes: ${yaExistentes}`);

    // Opcional: límite máximo de registros (ej. 2000) para no sobrecargar la colección
    const MAX_REGISTROS = 2000;
    const total = await SutranAlert.countDocuments();
    if (total > MAX_REGISTROS) {
      const excedentes = total - MAX_REGISTROS;
      const antiguos = await SutranAlert.find()
        .sort({ fechaInicio: 1 }) // más antiguos primero
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