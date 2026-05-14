const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const CgbvpAlert = require('../../models/CgbvpAlert');

// ============================================================================
// 🛠️ FUNCIÓN: GEOCODING EN SEGUNDO PLANO (Sonda Google Maps)
// ============================================================================
const ejecutarGeocodingEnSegundoPlano = async (alertaId, direccionLimpia) => {
  try {
    console.log(`📡 [GEO-GHOST] Triangulando vía Google IA: ${direccionLimpia}`);
    
    // Extraemos la llave secreta del entorno
    const apiKey = process.env.GOOGLE_MAPS_API_KEY; 
    
    if (!apiKey) {
        console.error('🔴 [GEO-GHOST] ERROR: Falta la GOOGLE_MAPS_API_KEY en el archivo .env');
        return;
    }

    // Añadimos "Perú" para acotar el rango de búsqueda del satélite de Google
    const query = encodeURIComponent(`${direccionLimpia}, Perú`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;

    // Disparo de la sonda
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;

      // Verificación de integridad: Confirmamos que la alerta siga requiriendo coordenadas
      const alerta = await CgbvpAlert.findById(alertaId);
      if (alerta && alerta.location.coordinates[0] === 0) {
        alerta.location.coordinates = [lng, lat];
        await alerta.save();
        console.log(`🎯 [GEO-GHOST] Blanco fijado [Google] para N° ${alerta.nroParte}: ${lat}, ${lng}`);
      }
    } else {
      console.warn(`⚠️ [GEO-GHOST] Google no pudo resolver la dirección: "${direccionLimpia}" | Estado: ${data.status}`);
    }
  } catch (error) {
    console.error(`🔴 [GEO-GHOST] Fallo crítico en sonda de Google: ${error.message}`);
  }
};

// ============================================================================
// 🛠️ FUNCIÓN: PARSEO DE FECHA
// ============================================================================
const parseFechaBomberos = (fechaStr) => {
  try {
    const regex = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([ap]\.?m\.?)/i;
    const match = fechaStr.match(regex);
    if (!match) return new Date(); 

    let [_, dd, mm, yyyy, hh, min, ss, ampm] = match;
    let hora = parseInt(hh, 10);
    if (ampm.toLowerCase().includes('p') && hora < 12) hora += 12;
    if (ampm.toLowerCase().includes('a') && hora === 12) hora = 0;
    
    // Guardar en UTC explícitamente
    return new Date(Date.UTC(
      parseInt(yyyy), parseInt(mm) - 1, parseInt(dd),
      hora, parseInt(min), parseInt(ss)
    ));
  } catch (e) {
    return new Date();
  }
};

// ============================================================================
// 🛡️ MOTOR PRINCIPAL: SYNC BOMBEROS
// ============================================================================
const syncBomberos = async () => {
  console.log('🚒 [CGBVP] Iniciando scraping con Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'accept-language': 'es-419,es-US;q=0.9,es;q=0.8' });

    await page.goto('https://sgonorte.bomberosperu.gob.pe/24horas/', {
      waitUntil: 'networkidle2', timeout: 60000
    });

    await page.waitForSelector('.card.shadow', { timeout: 15000 });
    const html = await page.content();

    const tarjetasHtml = html.split(/<div class="card shadow/i);
    tarjetasHtml.shift(); 

    console.log(`📋 [CGBVP] Tarjetas encontradas: ${tarjetasHtml.length}`);

    let nuevas = 0;
    let actualizadas = 0;
    const partes = []; 
    
    // ⚡ NUEVO: Cola de triangulación para la Patrulla Asíncrona
    const alertasParaGeocoding = []; 

    for (const tarjetaHtml of tarjetasHtml) {
      const $ = cheerio.load(`<div class="card shadow ${tarjetaHtml}`);

      // 1. Nro Parte
      const nroParteMatch = tarjetaHtml.match(/Parte:\s*(\d+)/i);
      if (!nroParteMatch) continue;
      const nroParte = nroParteMatch[1].trim();
      partes.push(nroParte); 

      // 2. Tipo y Estado
      let tipoEmergencia = repararCodificacion($('h5').text().replace(/#\d+/, '').trim()) || 'NO ESPECIFICADO';
      const estado = $('h6').text().trim().toUpperCase() || 'ATENDIENDO';

      // 3. Fecha y Hora
      const fechaMatch = tarjetaHtml.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[ap]\.?m\.?)/i);
      const fechaObj = fechaMatch ? parseFechaBomberos(fechaMatch[1]) : new Date();

      // 4. Extracción de Máquinas
      const maquinas = [];
      $('span.emergencia-item span').each((i, el) => {
        const nombre = $(el).text().trim();
        if (nombre) maquinas.push(nombre);
      });

      // 5. Dirección Cruda y Coordenadas iniciales
      let dirText = repararCodificacion($('p.card-text.m-0').text().trim());
      let lat = 0, lon = 0;
      const coordMatch = dirText.match(/\(([-0-9.]+),\s*([-0-9.]+)\)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
        dirText = dirText.replace(coordMatch[0], '');
      }

      // 6. CORTE QUIRÚRGICO DE LA DIRECCIÓN
      dirText = dirText.replace(new RegExp(`N[°º]\\s*Parte:\\s*${nroParte}`, 'gi'), '');
      if (fechaMatch) dirText = dirText.replace(fechaMatch[0], '');
      maquinas.forEach(maq => { dirText = dirText.replace(maq, ''); });
      dirText = dirText.replace(/\(?0,\s*0\)?/g, ''); // Erradica (0,0)
      dirText = dirText.replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').replace(/^-\s*/, '').trim();

      // 7. Persistencia en MongoDB
      const existe = await CgbvpAlert.findOne({ nroParte });
      let alertaDB; // Referencia para saber si encolamos o no

      if (!existe) {
        // CREACIÓN NUEVA ALERTA
        alertaDB = await CgbvpAlert.create({
          nroParte, fechaHora: fechaObj, tipoEmergencia, estado, direccion: dirText,
          location: { type: 'Point', coordinates: [lon, lat] }, maquinas
        });
        nuevas++;
      } else {
        // ACTUALIZACIÓN DE ALERTA EXISTENTE
        let huboCambios = false;
        
        if (existe.estado !== estado) { existe.estado = estado; huboCambios = true; }
        if (existe.maquinas.length !== maquinas.length) { existe.maquinas = maquinas; huboCambios = true; }
        if (existe.direccion !== dirText) { existe.direccion = dirText; huboCambios = true; }
        
        // Si CGBVP por fin reporta coordenadas oficiales y nosotros teníamos 0,0
        if (existe.location.coordinates[0] === 0 && lon !== 0) {
            existe.location.coordinates = [lon, lat];
            huboCambios = true;
        }

        if (huboCambios) {
          await existe.save();
          actualizadas++;
        }
        alertaDB = existe;
      }

      // 🎯 NUEVO GATILLO UNIVERSAL (Encola si la BD sigue teniendo 0,0)
      if (alertaDB.location.coordinates[0] === 0 && dirText.length > 5) {
          alertasParaGeocoding.push({ id: alertaDB._id, dir: dirText });
      }
    }

    if (partes.length > 0) {
      const resultado = await CgbvpAlert.deleteMany({ nroParte: { $nin: partes } });
      if (resultado.deletedCount > 0) console.log(`🧹 [CGBVP] Se eliminaron ${resultado.deletedCount} emergencias antiguas.`);
    }

    console.log(`🟢 [CGBVP] Sincronización completada. Nuevas: ${nuevas} | Actualizadas: ${actualizadas}`);

    // =========================================================================
    // 🚁 DISPARADOR DE GEOCODING (Procesamiento Simultáneo)
    // =========================================================================
    if (alertasParaGeocoding.length > 0) {
        
        // 1. EL LOG INICIAL QUE SOLICITÓ
        console.log(`🚁 [GEO-GHOST] Sonda activada. Alertas a corregir: ${alertasParaGeocoding.length}`);
        
        // 2. PROCESAMIENTO SIMULTÁNEO
        // Mapeamos el array para disparar su función por cada alerta al mismo tiempo
        const promesas = alertasParaGeocoding.map(alerta => 
            ejecutarGeocodingEnSegundoPlano(alerta.id, alerta.dir)
        );

        // Promise.all agrupa todos los disparos y avisa cuando todos terminaron
        Promise.all(promesas).then(() => {
            console.log(`✅ [GEO-GHOST] Todas las ${alertasParaGeocoding.length} alertas fueron procesadas exitosamente.`);
        }).catch(err => {
            console.error(`🔴 [GEO-GHOST] Error en el lote: ${err.message}`);
        });

    } else {
        console.log(`🚁 [GEO-GHOST] Escáner limpio. 0 alertas requieren triangulación.`);
    }

  } catch (error) {
    console.error(`🔴 [CGBVP] Error crítico: ${error.message}`);
  } finally {
    await browser.close();
    console.log('🔒 [CGBVP] Navegador cerrado.');
  }
};

// ============================================================================
// 🛠️ FUNCIÓN: FILTRO DE DESENCRIPTACIÓN (Anti-Mojibake)
// ============================================================================
const repararCodificacion = (texto) => {
  if (!texto) return '';
  
  // Diccionario táctico de caracteres corruptos -> caracteres limpios
  const mapaCorrecciones = {
    // Minúsculas
    'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú', 'Ã±': 'ñ',
    // Mayúsculas con su byte real
    'Ã\x81': 'Á', 'Ã\x89': 'É', 'Ã\x8D': 'Í', 'Ã\x93': 'Ó', 'Ã\x9A': 'Ú', 'Ã\x91': 'Ñ',
    // Variaciones comunes de texto plano (como el que usted encontró)
    'Ã': 'Á', 'Ã‰': 'É', 'Ã': 'Í', 'Ã“': 'Ó', 'Ãš': 'Ú',
    // Su caso específico capturado por el radar
    'GARCÃA': 'GARCÍA',
    'ÃA': 'ÍA',
    'ÃE': 'ÉE',
    'ÃO': 'ÑO'
  };

  let textoLimpio = texto;
  
  // Pasamos el escáner y reemplazamos cada anomalía
  for (const [corrupto, correcto] of Object.entries(mapaCorrecciones)) {
    textoLimpio = textoLimpio.split(corrupto).join(correcto);
  }
  
  return textoLimpio;
};

module.exports = syncBomberos;