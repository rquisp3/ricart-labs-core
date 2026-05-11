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
    'ID SUTRAN': r.idAlerta,
    'Estado': r.restriccion || 'NORMAL',
    'Fecha del evento': r.fechaInicio ? r.fechaInicio.toISOString() : '',
    'Fecha de actualización': r.updatedAt ? r.updatedAt.toISOString() : '',
    'Afectación': r.restriccion || '',
    'Carretera': r.via || '',
    'Ubigeo': '',                         // no lo tenemos aún
    'Coordenada': r.location?.coordinates
      ? `${r.location.coordinates[1]}, ${r.location.coordinates[0]}`
      : '',
    'Evento': r.tipoEvento || '',
    'Fuente': '',                        // no lo tenemos aún
    'Pasajeros Detenidos': '',
    'Mercancías Detenidas': ''
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

// ------------------------------------------------------------------
// Servicio principal
// ------------------------------------------------------------------
const obtenerDatosCompletos = async () => {
  const [
    sutranDocs,
    igpDocs,
    bomberosDocs,
    dicapiDocs,
    sedesDocs,
    cecomDocs,
    livecamsDocs  // Aún no se usa en el formato unificado, pero lo tenemos
  ] = await Promise.all([
    SutranAlert.find().lean(),
    IgpAlert.find().sort({ fechaHora: -1 }).lean(),
    CgbvpAlert.find().lean(),
    DicapiPort.find().lean(),
    Sede.find().lean(),
    [], // CECOM todavía no tiene modelo, lo añadiremos después
    LiveCam.find().lean()
  ]);

  return {
    sutran: formatearSutran(sutranDocs),
    igp: formatearIgp(igpDocs),
    bomberos: formatearBomberos(bomberosDocs),
    sedes: formatearSedes(sedesDocs),
    cecom: formatearCecom(cecomDocs),
    dicapi: formatearDicapi(dicapiDocs),
    // livecams se puede devolver en un endpoint aparte
  };
};

// También exportamos funciones individuales para endpoints específicos
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

module.exports = {
  obtenerDatosCompletos,
  obtenerSismos,
  obtenerCarreteras,
  obtenerBomberos,
  obtenerPuertos,
  obtenerSedes,
};