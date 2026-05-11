const axios = require('axios');
const cheerio = require('cheerio');
const CgbvpAlert = require('../../models/CgbvpAlert');

// Función auxiliar para convertir la fecha de los bomberos a formato nativo
const parseFechaBomberos = (fechaStr) => {
  try {
    // Busca el formato exacto: 24/05/2026 10:30:00 p.m.
    const regex = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([ap]\.?m\.?)/i;
    const match = fechaStr.match(regex);
    if (!match) return new Date(); // Si falla, usa la hora actual como salvavidas

    let [_, dd, mm, yyyy, hh, min, ss, ampm] = match;
    let hora = parseInt(hh, 10);
    
    if (ampm.toLowerCase().includes('p') && hora < 12) hora += 12;
    if (ampm.toLowerCase().includes('a') && hora === 12) hora = 0;
    
    return new Date(yyyy, parseInt(mm, 10) - 1, dd, hora, min, ss);
  } catch (e) {
    return new Date();
  }
};

const syncBomberos = async () => {
  console.log('🚒 [CGBVP] Radar escaneando emergencias...');  
  try {
    // 1. EL CACHE-BUSTER (Tu técnica original, intacta)
    const url = `https://sgonorte.bomberosperu.gob.pe/24horas/?t=${new Date().getTime()}`;
    
    // CAMUFLAJE AVANZADO: Simulamos ser un navegador real al 100%
    const respuesta = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      },
      timeout: 30000,
      validateStatus: () => true 
    });

    const data = respuesta.data;

    // 2. EL ESCUDO ANTI-VACÍOS (AHORA CON MODO ESPÍA)
    if (!data || data.length < 1000) {
      console.warn("⚠️ [CGBVP] La web no devolvió contenido válido. Abortando sincronización.");
      console.log(`🔍 [DEBUG CGBVP] Status Code: ${respuesta.status}`);
      // Imprimimos los primeros 300 caracteres para ver si es Cloudflare, un error de base de datos o qué.
      console.log(`🔍 [DEBUG CGBVP] Respuesta del servidor:`, String(data).substring(0, 300));
      return;
    }

    // 3. MOTOR DE EXTRACCIÓN (Usando Cheerio)
    const $ = cheerio.load(data);
    const tarjetas = $('.card.shadow').toArray();
    
    let nuevas = 0;
    let actualizadas = 0;

    for (const el of tarjetas) {
      const card = $(el);
      
      // -- Nro Parte --
      const headerText = card.find('.card-header').text();
      const nroParteMatch = headerText.match(/Parte:\s*(\d+)/i);
      if (!nroParteMatch) continue; // Si no hay parte, saltamos a la siguiente
      
      const nroParte = nroParteMatch[1].trim();

      // -- Tipo de Emergencia --
      const tipoEmergencia = card.find('h5').text().replace(/#\d+/, '').trim() || 'NO ESPECIFICADO';
      
      // -- Estado --
      const estado = card.find('h6').text().trim().toUpperCase() || 'ATENDIENDO';
      
      // -- Fecha --
      // Los bomberos suelen poner la fecha mezclada en el HTML, buscamos con tu Regex
      const htmlCompleto = card.html();
      const fechaMatch = htmlCompleto.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[ap]\.?m\.?)/i);
      const fechaObj = fechaMatch ? parseFechaBomberos(fechaMatch[1]) : new Date();

      // -- Dirección y Coordenadas --
      const dirText = card.find('p.card-text.m-0').text().trim();
      const coordMatch = dirText.match(/\(([-0-9.]+),\s*([-0-9.]+)\)/);
      
      let lat = 0, lon = 0;
      let direccionLimpia = dirText;

      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
        direccionLimpia = dirText.replace(coordMatch[0], "").replace(/\s{2,}/g, " ").trim();
      }

      // -- Máquinas (Ahora extraemos a un Array real de Mongoose) --
      const maquinas = [];
      card.find('span.emergencia-item span').each((i, span) => {
        const nomMaquina = $(span).text().trim();
        if (nomMaquina) maquinas.push(nomMaquina);
      });

      // 4. LÓGICA DE BASE DE DATOS (Crear o Actualizar)
      const existe = await CgbvpAlert.findOne({ nroParte });

      if (!existe) {
        // Alerta Nueva: La guardamos
        await CgbvpAlert.create({
          nroParte,
          fechaHora: fechaObj,
          tipoEmergencia,
          estado,
          direccion: direccionLimpia,
          location: { 
            type: 'Point', 
            coordinates: [lon, lat] // Recuerda: Mongo usa [Longitud, Latitud]
          },
          maquinas
        });
        nuevas++;
      } else {
        // Alerta Existente: Verificamos si cambió de estado o llegaron más máquinas
        let huboCambios = false;
        
        if (existe.estado !== estado) {
          existe.estado = estado;
          huboCambios = true;
        }
        
        // Si hay un número distinto de máquinas, actualizamos el array
        if (existe.maquinas.length !== maquinas.length) {
          existe.maquinas = maquinas;
          huboCambios = true;
        }

        if (huboCambios) {
          await existe.save();
          actualizadas++;
        }
      }
    }

    // 5. REPORTE EN CONSOLA
    if (nuevas > 0 || actualizadas > 0) {
      console.log(`🟢 [CGBVP] Operación exitosa. Nuevas: ${nuevas} | Actualizadas: ${actualizadas}`);
    }

  } catch (error) {
    console.error(`🔴 [CGBVP] Error Crítico de Scraper: ${error.message}`);
  }
};

module.exports = syncBomberos;