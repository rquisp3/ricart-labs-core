const alertService = require('../services/alertService');
const isseService = require ('../services/isseService');

// GET /alertas/todas → equivalente a obtenerDatosCompletos()
const getAlertasCompletas = async (req, res) => {
  try {
    const datos = await alertService.obtenerDatosCompletos();
    res.json({ success: true, timestamp: new Date(), data: datos });
  } catch (error) {
    console.error('Error en getAlertasCompletas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /alertas/sismos
const getSismos = async (req, res) => {
  try {
    const sismos = await alertService.obtenerSismos();
    res.json({ success: true, data: sismos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /alertas/carreteras
const getCarreteras = async (req, res) => {
  try {
    const carreteras = await alertService.obtenerCarreteras();
    res.json({ success: true, data: carreteras });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /alertas/bomberos
const getBomberos = async (req, res) => {
  try {
    const bomberos = await alertService.obtenerBomberos();
    res.json({ success: true, data: bomberos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /alertas/puertos
const getPuertos = async (req, res) => {
  try {
    const puertos = await alertService.obtenerPuertos();
    res.json({ success: true, data: puertos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /alertas/sedes
const getSedes = async (req, res) => {
  try {
    const sedes = await alertService.obtenerSedes();
    res.json({ success: true, data: sedes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const puppeteer = require('puppeteer');

const exportarPDF = async (req, res) => {
  try {
    const { html, nombreCliente } = req.body;
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    await browser.close();

    const base64 = pdfBuffer.toString('base64');
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nombreArchivo = `ISSE_Report_${nombreCliente.replace(/\s+/g, '_')}_${fecha}.pdf`;

    res.json({ success: true, base64, nombreArchivo });
  } catch (error) {
    console.error('Error generando PDF:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getNoticiasISSE = async (req, res) => {
  try {
    const data = await isseService.obtenerNoticiasISSE();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getNoticiasTicker = async (req, res) => {
  try {
    const data = await isseService.obtenerNoticiasTicker();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEfemerides = async (req, res) => {
  try {
    const data = await isseService.obtenerEfemerides();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getVersion = async (req, res) => {
  res.json({ success: true, version: '5.0' }); // o tomarlo de una variable de entorno
};

const getCamaras = async (req, res) => {
  try {
    const data = await alertService.obtenerCamaras();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTicker = async (req, res) => {
  try {
    const data = await alertService.obtenerNoticiasTicker();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAlertasCompletas,
  getSismos,
  getCarreteras,
  getBomberos,
  getPuertos,
  getSedes,
  exportarPDF,
  getNoticiasISSE, 
  getNoticiasTicker, 
  getEfemerides,
  getVersion,
  getCamaras,
  getTicker,
};