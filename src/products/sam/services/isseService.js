const Noticia = require('../models/Noticia');
const Efemeride = require('../models/Efemeride');
const { format } = require('date-fns');
const { es } = require('date-fns/locale');

// ---------- NOTICIAS ----------

// Para el ticker en tiempo real (todas las noticias, orden más reciente)
const obtenerNoticiasTicker = async () => {
  const docs = await Noticia.find()
    .sort({ fecha: -1 })
    .limit(100)
    .lean();
  return docs.map(n => ({
    fuente: n.fuente,
    titulo: n.titulo,
    descripcion: n.descripcion,
    ambito: n.ambito,
    enlace: n.url,
    fecha: n.fecha ? format(new Date(n.fecha), 'dd/MM/yyyy HH:mm') : '',
    ts: new Date().getTime()
  }));
};

// Para el informe ISSE (filtra por estado PENDIENTE, aplica cuotas)
const obtenerNoticiasISSE = async () => {
  // Tomamos las noticias más recientes con estado PENDIENTE
  const docs = await Noticia.find({ estado: 'PENDIENTE' })
    .sort({ fecha: -1 })
    .lean();

  // Aplicar cuotas (igual que en el GAS)
  const cuotas = {
    PERÚ: { 'Política': 2, 'Crimen organizado y delincuencia': 6, 'Economía Nacional': 1, 'Judiciales': 1, 'Social': 2 },
    REGIÓN: { 'Seguridad y crimen': 5, 'Comercio exterior': 1, 'Sucesos en la región': 3 },
    GLOBAL: { 'Geopolitica y conflictos': 3, 'Economía Internacional': 1, 'Sucesos importantes': 1, 'Ciencia y tecnología': 2 }
  };

  const contadores = {};
  const seleccionadas = [];

  for (const n of docs) {
    const key = `${n.ambito}_${n.categoria}`;
    const max = cuotas[n.ambito]?.[n.categoria] || 0;
    if (!contadores[key]) contadores[key] = 0;
    if (contadores[key] < max) {
      seleccionadas.push({
        hash: n.url,
        fecha: n.fecha ? format(new Date(n.fecha), 'dd/MM/yyyy HH:mm') : '',
        fuente: n.fuente,
        ambito: n.ambito,
        categoria: n.categoria,
        titulo: n.titulo,
        desarrollo: n.desarrollo || n.descripcion || ''
      });
      contadores[key]++;
    }
  }

  return seleccionadas;
};

// ---------- EFEMÉRIDES ----------

// Calcula la fecha concreta para este año a partir de la regla
function calcularFecha(mesTexto, reglaDia) {
  const meses = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
  };
  const mesNum = meses[mesTexto.toLowerCase()];
  const anio = new Date().getFullYear();
  const regla = reglaDia.toLowerCase().trim();

  // Si es un número fijo
  if (!isNaN(regla)) {
    return `${regla.padStart(2, '0')}/${String(mesNum + 1).padStart(2, '0')}/${anio}`;
  }

  const diasSemana = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6 };
  let diaObjetivo = -1;
  for (let d in diasSemana) {
    if (regla.includes(d)) { diaObjetivo = diasSemana[d]; break; }
  }
  let ocurrencia = 1;
  if (regla.includes('2do') || regla.includes('segundo')) ocurrencia = 2;
  if (regla.includes('3er') || regla.includes('tercer')) ocurrencia = 3;
  if (regla.includes('4to') || regla.includes('cuarto')) ocurrencia = 4;
  const esUltimo = regla.includes('ultimo') || regla.includes('último');

  let contador = 0;
  let ultimaFecha = null;
  const fecha = new Date(anio, mesNum, 1);
  while (fecha.getMonth() === mesNum) {
    if (fecha.getDay() === diaObjetivo) {
      contador++;
      ultimaFecha = new Date(fecha);
      if (!esUltimo && contador === ocurrencia) {
        return `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${anio}`;
      }
    }
    fecha.setDate(fecha.getDate() + 1);
  }
  if (esUltimo && ultimaFecha) {
    return `${String(ultimaFecha.getDate()).padStart(2, '0')}/${String(ultimaFecha.getMonth() + 1).padStart(2, '0')}/${anio}`;
  }
  return `${String(ultimaFecha?.getDate() || 1).padStart(2, '0')}/${String(mesNum + 1).padStart(2, '0')}/${anio}`;
}

const obtenerEfemerides = async () => {
  const docs = await Efemeride.find().lean();
  const anio = new Date().getFullYear();
  return docs.map(e => ({
    titulo: e.titulo,
    motivo: e.motivo,
    fechaCalculada: calcularFecha(e.mes, e.reglaDia)
  }));
};

// Añade estas exportaciones al final del archivo
module.exports = {
  // ... anteriores
  obtenerNoticiasTicker,
  obtenerNoticiasISSE,
  obtenerEfemerides
};