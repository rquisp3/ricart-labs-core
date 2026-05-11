const axios = require('axios');
const cheerio = require('cheerio');
const DicapiPort = require('../../models/DicapiPort');

const syncDicapi = async () => {
  try {
    // Reemplaza con la URL real de DICAPI
    const { data } = await axios.get('https://www.dicapi.mil.pe/api/ports', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(data);
    let actualizados = 0;

    // Lógica hipotética buscando en una tabla del HTML de Dicapi
    $('table tr').each(async (i, el) => {
      if (i === 0) return; // Saltar cabecera
      
      const columnas = $(el).find('td');
      const nombrePuerto = $(columnas[0]).text().trim();
      const estadoLogistico = $(columnas[1]).text().trim().toUpperCase(); // Ej: ABIERTO, CERRADO
      const resolucion = $(columnas[2]).text().trim();

      if (!nombrePuerto) return;

      // Usamos el nombre del puerto normalizado como ID temporal
      const idPuerto = nombrePuerto.toLowerCase().replace(/\s+/g, '-');

      const puerto = await DicapiPort.findOne({ idPuerto });

      if (!puerto) {
        // Si no existe, lo creamos
        await DicapiPort.create({
          idPuerto,
          puerto: nombrePuerto,
          estadoLogistico: estadoLogistico,
          resolucionMgp: resolucion,
          fechaReporte: new Date()
        });
        actualizados++;
      } else if (puerto.estadoLogistico !== estadoLogistico) {
        // Si existe pero cambió su estado (Ej: De ABIERTO a CERRADO por oleaje)
        puerto.estadoLogistico = estadoLogistico;
        puerto.resolucionMgp = resolucion;
        puerto.fechaReporte = new Date();
        await puerto.save();
        console.log(`⚠️ [DICAPI] Cambio de estado: Puerto ${nombrePuerto} ahora está ${estadoLogistico}`);
      }
    });

  } catch (error) {
    console.error(`🔴 [DICAPI] Error de conexión: ${error.message}`);
  }
};

module.exports = syncDicapi;