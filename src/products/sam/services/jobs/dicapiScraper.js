const axios = require('axios');
const crypto = require('crypto');
const DicapiPort = require('../../models/DicapiPort');

// ------------------------------------------------------
// Mapeo de la API a los valores exactos del enum
// ------------------------------------------------------
const mapearEstadoLogistico = (levelName) => {
  const texto = String(levelName).toUpperCase();
  if (texto.includes('CIERRE TOTAL')) return 'CERRADO';
  if (texto.includes('CIERRE PARCIAL')) return 'RESTRINGIDO';
  return 'ABIERTO';
};

// ------------------------------------------------------
// Scraper de Puertos (Dicapi) – Versión final ajustada a tu esquema
// ------------------------------------------------------
const syncDicapi = async () => {
  console.log('⚓ [DICAPI] Solicitando estado de puertos...');
  try {
    const url = 'https://www.dicapi.mil.pe/api/ports';
    const respuesta = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-419,es;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (respuesta.status !== 200) {
      console.error(`❌ [DICAPI] Error HTTP: ${respuesta.status}`);
      return;
    }

    const rawText = JSON.stringify(respuesta.data);
    const data = respuesta.data;

    if (!data || !data.data) {
      console.warn('⚠️ [DICAPI] La API no devolvió el array "data".');
      return;
    }

    // 2. Hash MD5 (igual que el GAS original)
    const currentHash = crypto.createHash('md5').update(rawText).digest('hex');

    // 3. Buscar documento de control para comparar hash
    const controlDoc = await DicapiPort.findOne({ idPuerto: 'HASH_CONTROL' });
    const lastHash = controlDoc ? controlDoc.hash : null;
    const huboCambios = (currentHash !== lastHash);

    if (!huboCambios) {
      console.log('ℹ️ [DICAPI] Sin cambios en los puertos. No se actualiza.');
      return;
    }

    console.log('🔄 [DICAPI] Cambios detectados. Actualizando colección...');
    const puertos = data.data;
    let nuevos = 0;
    let actualizados = 0;

    for (const p of puertos) {
      // Coordenadas
      const lat = (p.coordinates && p.coordinates.lat) ? p.coordinates.lat : 0;
      const lng = (p.coordinates && p.coordinates.long) ? p.coordinates.long : 0;

      // Fecha de reporte (ISO → Date)
      const fechaDate = p.updated_at ? new Date(p.updated_at) : new Date();

      // Estado logístico mapeado al enum
      const estado = mapearEstadoLogistico(p.levelName || '');

      // Objeto de datos que se ajusta al esquema
      const datosPuerto = {
        idPuerto: String(p.portId),                 // requerido único
        puerto: p.port ? String(p.port).trim() : 'SIN NOMBRE', // requerido
        capitania: p.captaincy ? String(p.captaincy).trim() : 'DESCONOCIDA',
        nivel: p.level ? String(p.level).trim() : 'N/A',
        estadoLogistico: estado,                    // solo valores del enum
        fechaReporte: fechaDate,                    // Date nativo
        resolucionMgp: p.resolution_number || 'S/N',
        location: {                                 // necesario para 2dsphere
          type: 'Point',
          coordinates: [lng, lat]                   // GeoJSON: [longitud, latitud]
        }
      };

      // Upsert basado en idPuerto
      const existente = await DicapiPort.findOne({ idPuerto: datosPuerto.idPuerto });

      if (!existente) {
        await DicapiPort.create(datosPuerto);
        nuevos++;
      } else {
        let cambios = false;
        if (existente.estadoLogistico !== estado) {
          existente.estadoLogistico = estado;
          cambios = true;
        }
        if (existente.nivel !== datosPuerto.nivel) {
          existente.nivel = datosPuerto.nivel;
          cambios = true;
        }
        if (existente.fechaReporte?.getTime() !== fechaDate.getTime()) {
          existente.fechaReporte = fechaDate;
          cambios = true;
        }
        if (cambios) {
          await existente.save();
          actualizados++;
        }
      }
    }

    // Actualizar hash de control
    if (controlDoc) {
      controlDoc.hash = currentHash;
      await controlDoc.save();
    } else {
      await DicapiPort.create({
        idPuerto: 'HASH_CONTROL',
        hash: currentHash,
        puerto: 'CONTROL',                          // requerido
        capitania: 'CONTROL',
        nivel: 'N/A',
        estadoLogistico: 'ABIERTO',                 // valor válido del enum
        fechaReporte: new Date(),
        resolucionMgp: 'N/A',
        location: {
          type: 'Point',
          coordinates: [0, 0]                       // para que no falle geoindex
        }
      });
    }

    console.log(`🟢 [DICAPI] Sincronización completada. Nuevos: ${nuevos} | Actualizados: ${actualizados}`);
  } catch (error) {
    console.error(`🔴 [DICAPI] Error crítico: ${error.message}`);
  }
};

module.exports = syncDicapi;