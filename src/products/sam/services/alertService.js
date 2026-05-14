const IgpAlert = require('../models/IgpAlert');
const CgbvpAlert = require('../models/CgbvpAlert');
const SutranAlert = require('../models/SutranAlert');
const DicapiPort = require('../models/DicapiPort');
const Sede = require('../models/Sede');
const LiveCam = require('../models/LiveCams');

// ------------------------------------------------------------------
// Helpers de formateo para cada tipo de alerta
// ------------------------------------------------------------------
const formatearSutran = (docs) =>
  docs.map((r) => ({
    idSutran: r.idAlerta,
    tipo_alerta: r.tipoAlerta || '',
    estado: r.estado || 'NORMAL',
    evento: r.evento || '',
    fechaHora_evento: r.fechaInicio ? r.fechaInicio.toISOString() : '',
    ubigeo: r.ubigeo || '',
    ubicación: r.ubicacion || '',
    latitud: r.location?.coordinates ? r.location.coordinates[1] : null,
    longitud: r.location?.coordinates ? r.location.coordinates[0] : null,
    fuente: r.fuente || '',
    motivo: r.motivo || ''
  }));

const formatearIgp = (docs) =>
  docs.map((r) => ({
    'ID Reporte': r.idReporte,
    'Fecha y Hora': r.fechaHora ? r.fechaHora.toISOString() : '',
    'Magnitud': r.magnitud,
    'Profundidad': r.profundidad,
    'Intensidad': r.intensidad,
    'Referencia': r.referencia,
    'Latitud': r.location?.coordinates?.[1] ?? '',
    'Longitud': r.location?.coordinates?.[0] ?? ''
  }));

const formatearBomberos = (docs) =>
  docs.map((r) => ({
    'Nro Parte': r.nroParte,
    'Fecha y Hora': r.fechaHora ? r.fechaHora.toISOString() : '',
    'Tipo de Emergencia': r.tipoEmergencia,
    'Estado': r.estado,
    'Direccion': r.direccion,
    'Latitud': r.location?.coordinates?.[1] ?? '',
    'Longitud': r.location?.coordinates?.[0] ?? '',
    'Maquinas': r.maquinas?.join(', ') || ''
  }));

const formatearDicapi = (docs) =>
  docs.map((r) => ({
    'ID': r.idPuerto,
    'PUERTO': r.puerto,
    'CAPITANÍA': r.capitania,
    'NOMBRE DEL PUERTO': r.puerto,
    'NIVEL': r.nivel,
    'ESTADO LOGÍSTICO': r.estadoLogistico,
    'LATITUD': r.location?.coordinates?.[1] ?? '',
    'LONGITUD': r.location?.coordinates?.[0] ?? '',
    'FECHA REPORTE': r.fechaReporte ? r.fechaReporte.toISOString() : '',
    'RESOLUCIÓN MGP': r.resolucionMgp || ''
  }));

const formatearSedes = (docs) =>
  docs.map((r) => ({
    'Codigo': r.codigo,
    'Sede': r.sede,
    'Direccion': r.direccion,
    'Negocio': r.negocio,
    'Coordenadas': r.location?.coordinates
      ? `${r.location.coordinates[1]}, ${r.location.coordinates[0]}`
      : ''
  }));

const formatearCecom = (docs) =>
  docs.map((r) => ({
    'Codigo': r.codigo,
    'Fecha y hora': r.fechaHora ? r.fechaHora.toISOString() : '',
    'Tipo Evento': r.tipoEvento,
    'Nivel Riesgo': r.nivelRiesgo,
    'Ubicación': r.ubicacion,
    'Coordenadas': r.coordenadas,
    'Descripción': r.descripcion,
    'Estado': r.estado
  }));

// ==================================================================
// 🛡️ MOTOR DE CACHÉ EN MEMORIA (RAM)
// ==================================================================
let cacheTodasLasAlertas = null;
let ultimaVezActualizado = 0;
// Tiempo de vida del escudo: 30 segundos en milisegundos
const TIEMPO_VIDA_CACHE_MS = 60000; 

// ------------------------------------------------------------------
// Servicio principal (/todas)
// ------------------------------------------------------------------
const obtenerDatosCompletos = async () => {
  const ahora = Date.now();

  // 1. INTERCEPCIÓN TÁCTICA: ¿El escudo está activo?
  if (cacheTodasLasAlertas && (ahora - ultimaVezActualizado < TIEMPO_VIDA_CACHE_MS)) {
    // Retornamos directamente de la RAM (0 impacto en DB)
    return cacheTodasLasAlertas; 
  }

  // 2. ESCUDO VENCIDO: Desplegamos la consulta a MongoDB
  const [
    sutranDocs,
    igpDocs,
    bomberosDocs,
    dicapiDocs,
    sedesDocs,
    cecomDocs,
    livecamsDocs
  ] = await Promise.all([
    SutranAlert.find().lean(),
    IgpAlert.find().sort({ fechaHora: -1 }).lean(),
    CgbvpAlert.find().lean(),
    DicapiPort.find().lean(),
    Sede.find().lean(),
    [], // CECOM
    LiveCam.find().lean()
  ]);

  const dataFormateada = {
    sutran: formatearSutran(sutranDocs),
    igp: formatearIgp(igpDocs),
    bomberos: formatearBomberos(bomberosDocs),
    sedes: formatearSedes(sedesDocs),
    cecom: formatearCecom(cecomDocs),
    dicapi: formatearDicapi(dicapiDocs),
  };

  // 3. RECARGA DE ESCUDO: Guardamos en la memoria y reiniciamos el reloj
  cacheTodasLasAlertas = dataFormateada;
  ultimaVezActualizado = ahora;

  return dataFormateada;
};

// ------------------------------------------------------------------
// Servicios individuales (Para endpoints específicos si los usa)
// ------------------------------------------------------------------
const obtenerSismos = async () => {
  const docs = await IgpAlert.find().sort({ fechaHora: -1 }).lean();
  return formatearIgp(docs);
};

const obtenerCarreteras = async () => {
  const docs = await SutranAlert.find().lean();
  return formatearSutran(docs);
};

const obtenerBomberos = async () => {
  const docs = await CgbvpAlert.find().lean();
  return formatearBomberos(docs);
};

const obtenerPuertos = async () => {
  const docs = await DicapiPort.find().lean();
  return formatearDicapi(docs);
};

const obtenerSedes = async () => {
  const docs = await Sede.find().lean();
  return formatearSedes(docs);
};

const obtenerCamaras = async () => {
  const cams = await LiveCam.find({ estado: 'ACTIVO' }).lean();
  return cams.map(c => ({
    id: c.idCamara,
    ubicacion: c.ubicacion,
    distrito: c.distrito,
    url: c.urlStream,
    lat: c.latitud,
    lng: c.longitud,
    proveedor: c.proveedor
  }));
};

module.exports = {
  obtenerDatosCompletos,
  obtenerSismos,
  obtenerCarreteras,
  obtenerBomberos,
  obtenerPuertos,
  obtenerSedes,
  obtenerCamaras
};