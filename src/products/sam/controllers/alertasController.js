const IgpAlert = require('../models/IgpAlert');
const CgbvpAlert = require('../models/CgbvpAlert');
const SutranAlert = require('../models/SutranAlert');
const DicapiPort = require('../models/DicapiPort');

// Controlador para obtener un resumen rápido para el Dashboard
const getDashboardSummary = async (req, res) => {
  try {
    // Ejecutamos todas las consultas a la base de datos EN PARALELO
    const [sismos, bomberos, carreteras, puertos] = await Promise.all([
      IgpAlert.find().sort({ fechaHora: -1 }).limit(10), // Últimos 10 sismos
      CgbvpAlert.find({ estado: 'ATENDIENDO' }).sort({ fechaHora: -1 }).limit(20), // Alertas activas
      SutranAlert.find().sort({ createdAt: -1 }).limit(15),
      DicapiPort.find({ estadoLogistico: { $ne: 'ABIERTO' } }) // Puertos con problemas
    ]);

    // Devolvemos un JSON estructurado y limpio
    res.status(200).json({
      success: true,
      timestamp: new Date(),
      data: {
        sismos,
        bomberos,
        carreteras,
        puertos
      }
    });
  } catch (error) {
    console.error('🔴 Error obteniendo datos del dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al obtener alertas',
      error: error.message
    });
  }
};

module.exports = {
  getDashboardSummary
};