const alertService = require('../services/alertService');

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

// POST /cecom/registrar (pendiente hasta tener el modelo)
const registrarCecom = async (req, res) => {
  res.status(501).json({ success: false, message: 'Endpoint CECOM aún no implementado.' });
};

module.exports = {
  getAlertasCompletas,
  getSismos,
  getCarreteras,
  getBomberos,
  getPuertos,
  getSedes,
  registrarCecom,
};