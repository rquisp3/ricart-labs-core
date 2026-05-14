const cron = require('node-cron');
const syncIgp = require('./jobs/igpScraper');
const syncBomberos = require('./jobs/bomberosScraper');
const syncSutran = require('./jobs/sutranScraper');
const syncDicapi = require('./jobs/dicapiScraper');

// Bloqueos para evitar ejecuciones solapadas
const locks = {
  igp: false,
  bomberos: false,
  sutran: false,
  dicapi: false
};

const withLock = (name, fn) => async () => {
  if (locks[name]) {
    console.log(`⏳ [${name.toUpperCase()}] Ejecución previa aún en curso. Saltando...`);
    return;
  }
  locks[name] = true;
  try {
    await fn();
  } catch (error) {
    console.error(`🔴 [${name.toUpperCase()}] Error en ejecución programada: ${error.message}`);
  } finally {
    locks[name] = false;
  }
};

const initSamCrons = () => {
  console.log('⏰ [SAM] Inicializando radares tácticos...');

  // Radar IGP: cada 5 minutos (suficiente para un sismo nuevo)
  cron.schedule('*/1 * * * *', withLock('igp', syncIgp));

  // Radar Bomberos: cada 5 minutos
  cron.schedule('*/5 * * * *', withLock('bomberos', syncBomberos));

  // Radar SUTRAN: cada 15 minutos (el endpoint oficial no se actualiza tan seguido)
  cron.schedule('*/15 * * * *', withLock('sutran', syncSutran));

  // Radar DICAPI: cada hora en el minuto 0
  cron.schedule('*/30 * * * *', withLock('dicapi', syncDicapi));

  // Disparo inicial (con retardo para que la app arranque estable)
  setTimeout(() => {
    console.log('🚀 [SAM] Primer ciclo de sincronización...');
    syncIgp();
    syncBomberos();
    syncSutran();
    syncDicapi();
  }, 10000); // 10 segundos después de iniciar
};

module.exports = { initSamCrons };