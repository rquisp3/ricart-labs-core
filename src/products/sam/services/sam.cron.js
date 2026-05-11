const cron = require('node-cron');
const syncIgp = require('./jobs/igpScraper');
const syncBomberos = require('./jobs/bomberosScraper');
const syncSutran = require('./jobs/sutranScraper.js');
const syncDicapi = require('./jobs/dicapiScraper');

const initSamCrons = () => {
  console.log('⏳ [SAM] Inicializando Radares Tácticos...');

  // Radar IGP: Cada 1 minutos
  cron.schedule('*/1 * * * *', () => syncIgp());

  // Radar Bomberos: Cada 2 minutos
  cron.schedule('*/2 * * * *', () => syncBomberos());
  
  // Radar SUTRAN: Cada 15 minutos
  cron.schedule('*/15 * * * *', () => syncSutran());
  
  // Radar DICAPI: Cada hora (en el minuto 0)
  cron.schedule('0 * * * *', () => syncDicapi());

  // Disparo inicial forzado
  syncIgp();
  syncBomberos();
  syncSutran(); 
  syncDicapi(); 
};

module.exports = { initSamCrons };