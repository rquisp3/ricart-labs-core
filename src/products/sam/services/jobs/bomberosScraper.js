const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const CgbvpAlert = require('../../models/CgbvpAlert');

// Función auxiliar para parsear la fecha (formato: 11/05/2026 08:56:22 a.m.)
const parseFechaBomberos = (fechaStr) => {
  try {
    const regex = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([ap]\.?m\.?)/i;
    const match = fechaStr.match(regex);
    if (!match) return new Date(); // fallback a fecha actual

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
    await page.setExtraHTTPHeaders({
      'accept-language': 'es-419,es-US;q=0.9,es;q=0.8'
    });

    // Navegar a la página
    await page.goto('https://sgonorte.bomberosperu.gob.pe/24horas/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('.card.shadow', { timeout: 15000 });
    const html = await page.content();

    // Dividir en tarjetas usando la misma técnica del GAS original (regex)
    const tarjetasHtml = html.split(/<div class="card shadow/i);
    tarjetasHtml.shift(); // Descartar lo que está antes del primer div.card

    console.log(`📋 [CGBVP] Tarjetas encontradas: ${tarjetasHtml.length}`);

    let nuevas = 0;
    let actualizadas = 0;
    const partes = []; // Array para almacenar los nroParte encontrados

    for (const tarjetaHtml of tarjetasHtml) {
      // Reconstruir el div para Cheerio
      const $ = cheerio.load(`<div class="card shadow ${tarjetaHtml}`);

      // 1. Nro Parte: regex sobre todo el HTML
      const nroParteMatch = tarjetaHtml.match(/Parte:\s*(\d+)/i);
      if (!nroParteMatch) continue;
      const nroParte = nroParteMatch[1].trim();
      partes.push(nroParte); // Almacenar para la limpieza posterior

      // 2. Tipo de Emergencia: texto del h5, eliminar prefijo #número
      let tipoEmergencia = $('h5').text().replace(/#\d+/, '').trim() || 'NO ESPECIFICADO';

      // 3. Estado: texto del h6 en mayúsculas
      const estado = $('h6').text().trim().toUpperCase() || 'ATENDIENDO';

      // 4. Fecha y Hora: regex específico (dd/mm/aaaa hh:mm:ss a.m./p.m.)
      const fechaMatch = tarjetaHtml.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[ap]\.?m\.?)/i);
      const fechaObj = fechaMatch ? parseFechaBomberos(fechaMatch[1]) : new Date();

      // 5. Dirección y Coordenadas: p.card-text.m-0 contiene la dirección y (lat,lon)
      let dirText = $('p.card-text.m-0').text().trim();
      let lat = 0, lon = 0;
      const coordMatch = dirText.match(/\(([-0-9.]+),\s*([-0-9.]+)\)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
        // Limpiar la dirección quitando las coordenadas y espacios dobles
        dirText = dirText.replace(coordMatch[0], '').replace(/\s{2,}/g, ' ').trim();
      }

      // 6. Máquinas: spans dentro de .emergencia-item
      const maquinas = [];
      $('span.emergencia-item span').each((i, el) => {
        const nombre = $(el).text().trim();
        if (nombre) maquinas.push(nombre);
      });

      // 7. Persistencia en MongoDB
      const existe = await CgbvpAlert.findOne({ nroParte });

      if (!existe) {
        // Nueva emergencia
        await CgbvpAlert.create({
          nroParte,
          fechaHora: fechaObj,
          tipoEmergencia,
          estado,
          direccion: dirText,
          location: {
            type: 'Point',
            coordinates: [lon, lat] // [longitud, latitud] para GeoJSON
          },
          maquinas
        });
        nuevas++;
      } else {
        // Verificar cambios
        let huboCambios = false;
        if (existe.estado !== estado) {
          existe.estado = estado;
          huboCambios = true;
        }
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

    // Limpiar emergencias que ya no están en la web
    if (partes.length > 0) {
      const resultado = await CgbvpAlert.deleteMany({ nroParte: { $nin: partes } });
      if (resultado.deletedCount > 0) {
        console.log(`🧹 [CGBVP] Se eliminaron ${resultado.deletedCount} emergencias antiguas.`);
      }
    }

    console.log(`🟢 [CGBVP] Sincronización completada. Nuevas: ${nuevas} | Actualizadas: ${actualizadas}`);
  } catch (error) {
    console.error(`🔴 [CGBVP] Error crítico: ${error.message}`);
  } finally {
    await browser.close();
    console.log('🔒 [CGBVP] Navegador cerrado.');
  }
};

module.exports = syncBomberos;