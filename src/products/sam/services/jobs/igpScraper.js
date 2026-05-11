const axios = require('axios');
const IgpAlert = require('../../models/IgpAlert.js')

const syncIgp = async () => {
  console.log('📡 [IGP] Radar escaneando sismos...');  
  try {
    // 1. Infiltración a la API (Como lo tenías en GAS)
    const { data } = await axios.get('https://ultimosismo.igp.gob.pe/api/ultimo-sismo', {
      headers: {
        "accept": "*/*",
        "referrer": "https://ultimosismo.igp.gob.pe/ultimo-sismo"
      }
    });

    if (!data || !data.codigo) return;
    const codigoCorto = String(data.codigo).trim();

    // 2. Validación Táctica: ¿Ya existe en Mongo?
    const existe = await IgpAlert.findOne({ idReporte: codigoCorto });
    if (existe) {
      return; // "Sin cambios. Último sismo ya registrado."
    }

    // 3. Transformación de Fechas y Datos
    const lat = parseFloat(data.latitud);
    const lng = parseFloat(data.longitud);
    
    const nuevoSismo = new IgpAlert({
      idReporte: codigoCorto,
      fechaHora: new Date(data.fecha_hora), // Node.js maneja fechas ISO nativamente
      magnitud: parseFloat(data.magnitud),
      profundidad: data.profundidad ? `${data.profundidad}km` : "-",
      intensidad: data.intensidades || "No reportada",
      referencia: data.referencia || "No reportada",
      location: {
        type: 'Point',
        coordinates: [lng, lat] // [Longitud, Latitud] ESTRICTAMENTE en este orden para Mongo
      }
    });

    // 4. Guardar en Base de Datos
    await nuevoSismo.save();
    console.log(`🟢 [IGP] ¡Nuevo sismo registrado! M${data.magnitud} en ${data.referencia}`);

  } catch (error) {
    console.error(`🔴 [IGP] Error de conexión: ${error.message}`);
  }
};

module.exports = syncIgp;