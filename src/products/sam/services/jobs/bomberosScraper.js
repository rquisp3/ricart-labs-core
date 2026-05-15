const axios = require('axios');
const cheerio = require('cheerio');
const CgbvpAlert = require('../../models/CgbvpAlert');

// Parseo de fecha (se mantiene igual)
const parseFechaBomberos = (fechaStr) => {
  try {
    const regex = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([ap]\.?m\.?)/i;
    const match = fechaStr.match(regex);
    if (!match) return new Date();
    let [_, dd, mm, yyyy, hh, min, ss, ampm] = match;
    let hora = parseInt(hh, 10);
    if (ampm.toLowerCase().includes('p') && hora < 12) hora += 12;
    if (ampm.toLowerCase().includes('a') && hora === 12) hora = 0;
    return new Date(Date.UTC(yyyy, parseInt(mm, 10) - 1, dd, hora, min, ss));
  } catch (e) {
    return new Date();
  }
};

const syncBomberos = async () => {
  console.log('🚒 [CGBVP] Intentando scraping directo (sin Puppeteer)...');
  try {
    const url = 'https://sgonorte.bomberosperu.gob.pe/24horas';
    const respuesta = await axios.get(url, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'es-419,es-US;q=0.9,es;q=0.8',
        'cache-control': 'max-age=0',
        'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
      },
      timeout: 30000,
      responseType: 'text'
    });

    const html = respuesta.data;
    if (!html || html.length < 1000) {
      console.warn('⚠️ [CGBVP] La respuesta no contiene HTML suficiente.');
      return;
    }

    // Dividir en tarjetas con la misma técnica del GAS
    const tarjetasHtml = html.split(/<div class="card shadow/i);
    tarjetasHtml.shift();
    console.log(`📋 [CGBVP] Tarjetas encontradas: ${tarjetasHtml.length}`);

    let nuevas = 0, actualizadas = 0;
    const partes = [];

    for (const tarjetaHtml of tarjetasHtml) {
      const $ = cheerio.load(`<div class="card shadow ${tarjetaHtml}`);

      const nroParteMatch = tarjetaHtml.match(/Parte:\s*(\d+)/i);
      if (!nroParteMatch) continue;
      const nroParte = nroParteMatch[1].trim();
      partes.push(nroParte);

      let tipoEmergencia = $('h5').text().replace(/#\d+/, '').trim() || 'NO ESPECIFICADO';
      const estado = $('h6').text().trim().toUpperCase() || 'ATENDIENDO';

      const fechaMatch = tarjetaHtml.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[ap]\.?m\.?)/i);
      const fechaObj = fechaMatch ? parseFechaBomberos(fechaMatch[1]) : new Date();

      let dirText = $('p.card-text.m-0').text().trim();
      let lat = 0, lon = 0;
      const coordMatch = dirText.match(/\(([-0-9.]+),\s*([-0-9.]+)\)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
        dirText = dirText.replace(coordMatch[0], '').replace(/\s{2,}/g, ' ').trim();
      }

      const maquinas = [];
      $('span.emergencia-item span').each((i, el) => {
        const nombre = $(el).text().trim();
        if (nombre) maquinas.push(nombre);
      });

      // Persistencia
      const existe = await CgbvpAlert.findOne({ nroParte });
      if (!existe) {
        await CgbvpAlert.create({
          nroParte,
          fechaHora: fechaObj,
          tipoEmergencia,
          estado,
          direccion: dirText,
          location: { type: 'Point', coordinates: [lon, lat] },
          maquinas
        });
        nuevas++;
      } else {
        let huboCambios = false;
        if (existe.estado !== estado) { existe.estado = estado; huboCambios = true; }
        if (existe.maquinas.length !== maquinas.length) { existe.maquinas = maquinas; huboCambios = true; }
        if (huboCambios) { await existe.save(); actualizadas++; }
      }
    }

    // Limpiar antiguas
    if (partes.length > 0) {
      const resultado = await CgbvpAlert.deleteMany({ nroParte: { $nin: partes } });
      if (resultado.deletedCount > 0) console.log(`🧹 [CGBVP] Se eliminaron ${resultado.deletedCount} emergencias antiguas.`);
    }

    console.log(`🟢 [CGBVP] Sincronización completada. Nuevas: ${nuevas} | Actualizadas: ${actualizadas}`);
  } catch (error) {
    if (error.response) {
      console.error(`🔴 [CGBVP] Error HTTP ${error.response.status}: ${error.response.statusText}`);
    } else {
      console.error(`🔴 [CGBVP] Error: ${error.message}`);
    }
  }
};

module.exports = syncBomberos;