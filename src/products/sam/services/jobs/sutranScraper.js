const axios = require('axios');
const crypto = require('crypto');
const SutranAlert = require('../../models/SutranAlert');

const syncSutran = async () => {
  console.log('🛣️ [SUTRAN] Radar escaneando carreteras...');
  try {
    const url = "http://gis.sutran.gob.pe/alerta_sutran/script_cgm/carga_xlsx.php?tipo=MAPA";
    
    // Hacemos la petición (con un User-Agent por si SUTRAN bloquea bots)
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000 // Máximo 10 segundos de espera
    }); 

    // 1. EXTRAER Y JUNTAR LOS ARRAYS: Tal como lo tenías en Apps Script
    let listaAlertas = [];
    const categorias = ['normal', 'restringido', 'interrumpido'];
    
    categorias.forEach(categoria => {
      if (data[categoria] && Array.isArray(data[categoria])) {
        // Concatenamos todos los puntos en un solo super-array
        listaAlertas = listaAlertas.concat(data[categoria]);
      }
    });

    if (listaAlertas.length === 0) {
      console.log('⚪ [SUTRAN] La API respondió, pero no hay alertas activas hoy.');
      return;
    }

    let nuevas = 0;

    // 2. ITERAMOS LA LISTA UNIFICADA
    for (const marcador of listaAlertas) {
      const prop = marcador.properties || {};
      
      // Rescatar Coordenadas (tu misma lógica de GAS)
      let lat = prop.latitud || prop.LATITUD || prop.lat;
      let lon = prop.longitud || prop.LONGITUD || prop.lon;

      if ((!lat || !lon) && marcador.geometry && marcador.geometry.coordinates) {
        lon = marcador.geometry.coordinates[0];
        lat = marcador.geometry.coordinates[1];
      }

      const coordenadaStr = `${lat || ''}, ${lon || ''}`;
      const fechaEvento = prop.fecha_evento || '';
      const carretera = prop.nombre_carretera || '';

      // 3. NUEVO MOTOR HASH: Más robusto usando Crypto nativo de Node.js
      const stringToHash = coordenadaStr + fechaEvento + carretera;
      const idAlertaHash = crypto.createHash('md5').update(stringToHash).digest('hex');
      const idVirtual = `SUT-${idAlertaHash.substring(0, 10).toUpperCase()}`; // Ej: SUT-A1B2C3D4E5

      // 4. VERIFICACIÓN Y GUARDADO EN MONGO
      const existe = await SutranAlert.findOne({ idAlerta: idVirtual });
      
      if (!existe) {
        await SutranAlert.create({
          idAlerta: idVirtual,
          // Convertir la fecha. Si falla, usa la fecha actual.
          fechaInicio: fechaEvento ? new Date(fechaEvento.split('/').reverse().join('-')) : new Date(),
          via: carretera || "Vía no especificada",
          sentido: "Ambos", // SUTRAN suele afectar ambos sentidos
          kilometro: "S/N",
          restriccion: (prop.estado || prop.afectacion || 'Interrumpido').toUpperCase(),
          tipoEvento: prop.evento || "Incidente en la vía",
          location: {
            type: 'Point',
            // En GeoJSON de MongoDB el orden SIEMPRE es: [Longitud, Latitud]
            coordinates: (lon && lat) ? [parseFloat(lon), parseFloat(lat)] : [0, 0] 
          }
        });
        nuevas++;
      }
    }

    if (nuevas > 0) {
      console.log(`🟢 [SUTRAN] ${nuevas} nuevas alertas de carreteras (SUTRAN) guardadas en la DB.`);
    }

  } catch (error) {
    console.error(`🔴 [SUTRAN] Error al procesar alertas: ${error.message}`);
  }
};

module.exports = syncSutran;