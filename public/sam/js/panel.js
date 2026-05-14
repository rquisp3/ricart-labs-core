// panel.js – Controlador completo del panel SAM (migrado desde GAS a Node.js)
// Depende de AuthService y ApiClient (auth.js y api.js)

// ========== VARIABLES GLOBALES ==========
let map, mapTileLayer, tacticalGridLayer, heatLayer, windLayer;
let isWindLoading = false;
let markerGroup, allMarkers = [], currentUser = null;
let isDarkMode = true, isFullScreen = false, datosGlobales;
let layerState = {
  'LIVE_CAMS': false,
  'SEDES': false,
  'SUTRAN_INTERRUMPIDO': true,
  'SUTRAN_RESTRINGIDO': true,
  'SUTRAN_NORMAL': false,
  'CGBVP_INCENDIO': true,
  'CGBVP_MATPEL': true,
  'CGBVP_ACCVEH': true,
  'CGBVP_EMERGMED': true,
  'CGBVP_RESCATE': true,
  'CGBVP_SERVESP': false,
  'CGBVP_CERRADO': false,
  'IGP_ALTO': true,
  'IGP_MODERADO': true,
  'IGP_LEVE': true,
  'DICAPI_ROJO': true,
  'DICAPI_AMBAR': true,
  'DICAPI_VERDE': true,
  'CECOM_ALTO': false,
  'CECOM_MEDIO': false,
  'HEATMAP': false,
  'WIND_FLOW': false
};
//let layerCCTV = L.layerGroup();
//let dataCCTVGlobal = [];
let sysMemory = { sutran: new Set(), igp: new Set(), bomberos: new Set(), cecom: new Set(), dicapi: {} };
let isFirstLoad = true;
let ultimaDataOSINT = [], ultimaDataDicapi = [];
let globalDicapiCounts = { total: 0, rojo: 0, ambar: 0, verde: 0 };
  let htmlListaPuertos = '<div class="text-center text-gray-500 py-10 font-console"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Cargando...</div>';
  let htmlListaSutran = '<div class="text-center text-gray-500 py-10 font-console"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Cargando...</div>';
  let htmlListaIgp = '<div class="text-center text-gray-500 py-10 font-console"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Cargando...</div>';
  let htmlListaBomberos = '<div class="text-center text-gray-500 py-10 font-console"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Cargando...</div>';
  // Variables de Estado del Boletín
  let isseNoticias = [];
  let isseClientes = [];
  let isseEfemerides = [];
let cecomMiniMap = null, cecomMarker = null;
let globalCounts = {};

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Obtener token de Mapbox (por si no lo tenemos embebido)
    const res = await fetch('/api/v1/config/public');
    const config = await res.json();
    if (config.success && config.data.mapboxToken) {
      MAPBOX_TOKEN = config.data.mapboxToken;
    }

    // 2. Verificar sesión (como ya lo hacías)
    const data = await AuthService.getProfile();
    currentUser = data.data;
    aplicarIdentidad(currentUser);

    // 3. Inicializar el resto del panel
    initMap();
    startClock();
    obtenerVersionSistema();
    obtenerDatosIniciales();

    // 4. REFRESCO AUTOMÁTICO (cada 60 segundos) ---
    setInterval(() => {
        refreshData();
    }, 60000);

    // 5. Cargar Cámaras
    setTimeout(() => cargarCamarasLive(), 2000);

    // 6. Iniciar ticker y actualizarlo periódicamente
    refreshOSINT();
    setInterval(refreshOSINT, 120000); // cada 2 minutos

    document.getElementById('btn-logout-trigger').classList.remove('hidden');
  } catch (err) {
    window.location.href = '/sam';
  }
});

function aplicarIdentidad(user) {
  const btnAdd = document.getElementById('menu-add-alert');
  if (btnAdd) btnAdd.classList.toggle('hidden', !(user.perfil === 'ADMIN' || user.perfil === 'USER'));
  const logoImg = document.getElementById('client-logo-img');
  if (logoImg && user.logo) {
    logoImg.src = user.logo;
    logoImg.classList.remove('hidden');
  }

  // Logo del cliente
  const separator = document.getElementById('client-logo-separator');
  if (logoImg && separator) {
    if (user.logo && user.logo.trim() !== '') {
      logoImg.src = user.logo;
      logoImg.classList.remove('hidden');
      separator.classList.remove('hidden');
    } else {
      logoImg.classList.add('hidden');
      separator.classList.add('hidden');
    }
  }

  // Colores corporativos (si quieres cambiar algún elemento del tema)
  if (user.colores) {
    const [primary, secondary] = user.colores.split(',');
    // Puedes inyectar variables CSS para usar en ISSE o en la interfaz general
    document.documentElement.style.setProperty('--cliente-primary', primary?.trim() || '#0f172a');
    document.documentElement.style.setProperty('--cliente-secondary', secondary?.trim() || primary?.trim() || '#0ea5e9');
  }
}


// ========== API ==========
async function obtenerDatosIniciales() {
  try {
    const data = await ApiClient.request('/api/v1/sam/alertas/todas');
    procesarDatosCompletos(data.data);
  } catch (error) {
    console.error('Error cargando alertas:', error);
  }
}

async function refreshData() {
  console.log('🔄 [SAM] Refrescando datos automáticamente...');
  try {
    const data = await ApiClient.request('/api/v1/sam/alertas/todas');
    procesarDatosCompletos(data.data);
    if (typeof Toast !== 'undefined') {
      Toast.fire({ icon: 'success', title: 'Datos actualizados', timer: 2000 });
    }
  } catch (error) {
    console.error('Error en refresco automático:', error);
  }
}

async function cerrarSesion() {
  await AuthService.logout();
  window.location.href = '/sam';
}

// ========== MAPA ==========
function initMap() {
  if (typeof map !== 'undefined' && map) map.remove();
  map = L.map('map', { zoomSnap: 0.1, zoomControl: false, attributionControl: false, fadeAnimation: true }).setView([-9.1900, -75.0152], 6);
  const mapContainer = map.getContainer();
  if (mapContainer) mapContainer.style.backgroundColor = '#1F1F1F';
  map.whenReady(() => {
    setTimeout(() => {
      const destinoIzquierda = document.querySelector('.leaflet-top.leaflet-left');
      const controlesDerecha = document.querySelectorAll('.leaflet-top.leaflet-right, .mapboxgl-ctrl-top-right');
      if (destinoIzquierda) {
        controlesDerecha.forEach(contenedor => {
          while (contenedor.firstChild) destinoIzquierda.appendChild(contenedor.firstChild);
          contenedor.style.display = 'none';
        });
        destinoIzquierda.querySelectorAll('.leaflet-control, .mapboxgl-ctrl').forEach(btn => {
          btn.style.margin = '5px 0 0 10px';
          btn.style.float = 'none';
        });
      }
    }, 1500);
  });
  setMapLayer();
  markerGroup = L.layerGroup().addTo(map);
  window.addEventListener('resize', forceMapRepaint);
}

let MAPBOX_TOKEN = '';

function setMapLayer() {
  if (mapTileLayer) map.removeLayer(mapTileLayer);
  if (tacticalGridLayer) map.removeLayer(tacticalGridLayer);
  const style = isDarkMode ? 'dark-v11' : 'light-v11';
  mapTileLayer = L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/' + style + '/tiles/256/{z}/{x}/{y}@2x?access_token=' + MAPBOX_TOKEN, {
  maxZoom: 18
}).addTo(map);
  tacticalGridLayer = new L.GridLayer({ tileSize: 200, zIndex: 5 });
  tacticalGridLayer.createTile = function (coords) {
    const tile = document.createElement('div');
    tile.style.outline = isDarkMode ? '1px solid rgba(0, 255, 65, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)';
    if (coords.z > 5) {
      tile.style.display = 'flex';
      tile.style.alignItems = 'flex-end';
      tile.style.justifyContent = 'flex-end';
      tile.style.padding = '4px 6px';
      tile.style.color = isDarkMode ? 'rgba(0, 255, 65, 0.3)' : 'rgba(0, 0, 0, 0.3)';
      tile.style.fontSize = '9px';
      tile.style.fontFamily = 'monospace';
      tile.style.fontWeight = 'bold';
      tile.style.letterSpacing = '1px';
      tile.style.pointerEvents = 'none';
      const letra = String.fromCharCode(65 + (Math.abs(coords.x) % 26));
      const numero = Math.abs(coords.y % 100);
      tile.innerHTML = `Q-${letra}${numero} <span style="font-size:7px; margin-left:3px; opacity:0.7;">NM</span>`;
    }
    return tile;
  };
  tacticalGridLayer.addTo(map);
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  isDarkMode = !isDarkMode;
  setMapLayer();
}

function startClock() {
  const clockEl = document.getElementById('sys-clock');
  const dateEl = document.getElementById('sys-date');
  if (!clockEl || !dateEl) return;
  setInterval(() => {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('es-PE', { hour12: false, timeZone: 'America/Lima' });
    dateEl.innerText = now.toLocaleDateString('es-PE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
  }, 1000);
}

async function obtenerVersionSistema() {
  try {
    const res = await fetch('/api/v1/sam/version');
    const data = await res.json();
    if (data.success) {
      document.getElementById('app-version-badge').innerText = 'v' + data.version;
    }
  } catch (e) {}
}

// ========== PROCESAMIENTO DE DATOS (MIGRADO DE js.html) ==========
function procesarDatosCompletos(datos) {
    if(!datos) return;
    datosGlobales = datos;
    
    if(datos.sutran) {
        datos.sutran.forEach(r => { 
            let id = r['ID SUTRAN']; 
            if(id && !sysMemory.sutran.has(id)) { 
                sysMemory.sutran.add(id); 
                if(!isFirstLoad) { triggerCardAlarm('ALERTAS SUTRAN'); }
            }
        });
    }
    if(datos.bomberos) {
        datos.bomberos.forEach(r => { 
            let id = r['Nro Parte']; 
            if(id && !sysMemory.bomberos.has(id)) { 
                sysMemory.bomberos.add(id); 
                if(!isFirstLoad) { 
                    triggerCardAlarm('ALERTAS CGBVP'); 
                    if(r['Estado'].toUpperCase().includes('ATENDIENDO')) spawnSilentRadar(parseFloat(r['Latitud']), parseFloat(r['Longitud']), 'red');
                }
            }
        });
    }
    if(datos.igp) {
        datos.igp.forEach(r => { 
            let id = r['ID Reporte']; 
            if(id && !sysMemory.igp.has(id)) { 
                sysMemory.igp.add(id); 
                if(!isFirstLoad) { 
                    triggerCardAlarm('ALERTAS IGP'); 
                    spawnSilentRadar(parseFloat(r['Latitud']), parseFloat(r['Longitud']), 'amber');
                }
            }
        });
    }
    if(datos.cecom) {
        datos.cecom.forEach(r => { 
            let id = r['Codigo'] || r['Código']; 
            if(id && !sysMemory.cecom.has(id)) { 
                sysMemory.cecom.add(id); 
                if(!isFirstLoad && r['Estado'].toUpperCase().includes('ACTIVO')) { 
                    triggerCardAlarm('ALERTAS SAM');
                    let coordStr = r['Coordenadas'] || '';
                    if(coordStr.includes(',')){
                        let pts = coordStr.split(',');
                        spawnSilentRadar(parseFloat(pts[0]), parseFloat(pts[1]), 'red');
                    }
                }
            }
        });
    }
    
    if (markerGroup) markerGroup.clearLayers();
    allMarkers = []; 
    
    let counts = {
      sutran: { total: 0, interrumpido: 0, restringido: 0, normal: 0 },
      cgbvp: { total: 0, incendio: 0, matpel: 0, accveh: 0, emergmed: 0, rescate: 0, servesp: 0, cerrado: 0 },
      igp: { total: 0, alto: 0, moderado: 0, leve: 0 },
      sedes: { total: 0 },
      cecom: { total: 0, alto: 0, medio: 0 },
      dicapi: { total: 0, rojo: 0, ambar: 0, verde: 0 } // <-- NUEVO CONTADOR
    };

    function parseDateGlobal(dStr) {
  if (!dStr) return 0;

  const str = String(dStr).trim();

  // 1. Intentar formato ISO 8601 (el que ahora entrega la API)
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) {
    // Convertir a número entero AAAAMMDDHHMMSS en zona horaria de Perú
    const peruStr = isoDate.toLocaleString('sv-SE', { timeZone: 'America/Lima' });
    return parseInt(peruStr.replace(/\D/g, '').substring(0, 14), 10);
  }

  // 2. Si no es ISO, usar la lógica original (para fechas viejas en otro formato)
  const dateMatch = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateMatch) return 0;

  let [_, dd, mm, yyyy] = dateMatch;
  let timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let hh = "00", min = "00", ss = "00";

  if (timeMatch) {
    hh = timeMatch[1].padStart(2, '0');
    min = timeMatch[2];
    ss = timeMatch[3] || "00";

    if (str.includes('P.M.') || str.includes('PM')) {
      let hNum = parseInt(hh, 10);
      if (hNum < 12) hh = (hNum + 12).toString();
    } else if (str.includes('A.M.') || str.includes('AM')) {
      let hNum = parseInt(hh, 10);
      if (hNum === 12) hh = "00";
    }
  }

  return parseInt(yyyy + mm + dd + hh + min + ss, 10);
 }
    //////////////////////////////////////////////////////////////////////////////////////////
    // ================== 1.PROCESAR SUTRAN ==============================================
    //////////////////////////////////////////////////////////////////////////////////////////

// ================== 1. PROCESAR SUTRAN (REDISEÑO COMPLETO CON NUEVAS CLAVES) ==================
if(datos.sutran && datos.sutran.length > 0) {
  datos.sutran.sort((a, b) => parseDateGlobal(b.fechaHora_evento) - parseDateGlobal(a.fechaHora_evento));

  const totalAlertas = datos.sutran.length;
  const topAlerta = datos.sutran[0];

  let tarjetasHtml = '';

  datos.sutran.forEach(function(row, idx) {
    try {
      counts.sutran.total++;

      // Determinar estado y color
      const estadoRaw = (row.estado || 'NORMAL').toUpperCase();
      let estadoLimpio = estadoRaw.replace('TRÁNSITO ', '').replace('TRANSITO ', '').trim();
      let colorTailwind = 'green';
      
      let iconClass = 'fa-road';           // icono por defecto
let baseColor = 'cyan';             // color por defecto (para el ícono en la tarjeta)
const motivo = (row.motivo || '').toUpperCase();

if (motivo.includes('CLIMATOLOGICO')) {
  iconClass = 'fa-cloud-rain';
  baseColor = 'blue';
} else if (motivo.includes('ACCIDENTE')) {
  iconClass = 'fa-car-burst';
  baseColor = 'red';
} else if (motivo.includes('INFRAESTRUCTURA')) {
  iconClass = 'fa-bridge';
  baseColor = 'amber';
} else if (motivo.includes('HUMANO')) {
  iconClass = 'fa-people-group';
  baseColor = 'orange';
}

      let layerId = 'SUTRAN_NORMAL';

      if (estadoLimpio.includes('INTERRUMPIDO')) { colorTailwind = 'red'; counts.sutran.interrumpido++; layerId = 'SUTRAN_INTERRUMPIDO'; }
      else if (estadoLimpio.includes('RESTRINGIDO')) { colorTailwind = 'amber'; counts.sutran.restringido++; layerId = 'SUTRAN_RESTRINGIDO'; }
      else { counts.sutran.normal++; estadoLimpio = 'NORMAL'; }

      // Coordenadas ahora vienen separadas
      const lat = row.latitud != null ? parseFloat(row.latitud) : null;
      const lng = row.longitud != null ? parseFloat(row.longitud) : null;
      const tieneCoords = !isNaN(lat) && !isNaN(lng);

      if (tieneCoords) {
        const markerIconColor = isDarkMode ? 'text-gray-900' : 'text-white';
        const idAcordeon = 'acord-sutran-' + idx;
        const iconSutran = L.divIcon({
  html: `<div class="w-5 h-5 rounded-full bg-${colorTailwind}-500 icon-marker marker-rumble flex items-center justify-center text-white dark:text-gray-900"><i class="fa-solid ${iconClass} text-[12px]"></i></div>`,
  className: '', iconSize: [20, 20], iconAnchor: [10, 10]
});
        const marker = L.marker([lat, lng], { icon: iconSutran }).on('click', function() {
          enfocarDesdeMapa(lat, lng, idAcordeon, colorTailwind, 'ALERTAS SUTRAN');
        }).bindTooltip(
          `<b class="font-sans text-[10px] uppercase text-${colorTailwind}-500">${row.ubicación || 'Vía'}</b><br><span class="text-[9px] dark:text-gray-300">${row.evento || ''}</span>`,
          { className: 'custom-tooltip' }
        );
        allMarkers.push({ marker, layerId });
      }

      const idAcordeon = 'acord-sutran-' + idx;
      const accionClic = tieneCoords ? `clickDesdeSidebar(${lat}, ${lng}, '${idAcordeon}', '${colorTailwind}')` : '';
      const fechaStr = formatearFechaPeru(row.fechaHora_evento) || '-';
      const ubicacionStr = row.ubicación || 'Sin ubicación';
      const eventoStr = row.evento || row.motivo || 'SIN DETALLE';
      const ubigeoStr = row.ubigeo || '-';
      const fuenteStr = row.fuente || 'N/A';
      const tipoAlertaStr = row.tipo_alerta || '';

      // Badge de estado
      let badgeEstado = '';
      if (estadoLimpio === 'INTERRUMPIDO') {
        badgeEstado = `<span class="bg-transparent border border-red-800/80 text-red-500 px-1.5 py-0.5 rounded text-[8px] font-console tracking-wider uppercase flex items-center gap-1 shadow-sm"><i class="fa-solid fa-circle-exclamation text-[8px] animate-pulse"></i>INTERRUMPIDO</span>`;
      } else if (estadoLimpio === 'RESTRINGIDO') {
        badgeEstado = `<span class="bg-transparent border border-amber-800/80 text-amber-500 px-1.5 py-0.5 rounded text-[8px] font-console tracking-wider uppercase flex items-center gap-1 shadow-sm"><i class="fa-solid fa-triangle-exclamation text-[8px]"></i>RESTRINGIDO</span>`;
      } else {
        badgeEstado = `<span class="bg-transparent border border-green-800/80 text-green-500 px-1.5 py-0.5 rounded text-[8px] font-console tracking-wider uppercase flex items-center gap-1 shadow-sm"><i class="fa-solid fa-check text-[8px]"></i>NORMAL</span>`;
      }

      // Datos para búsqueda y modal
      const dataSearchStr = `${ubicacionStr} ${estadoLimpio} ${eventoStr} ${ubigeoStr} ${fuenteStr} ${tipoAlertaStr}`.toLowerCase();
      const dataModal = encodeURIComponent(JSON.stringify({
        lat, lng,
        ubicacion: ubicacionStr,
        estado: estadoLimpio,
        fecha: fechaStr,
        evento: eventoStr,
        ubigeo: ubigeoStr,
        fuente: fuenteStr,
        tipo_alerta: tipoAlertaStr,
        motivo: row.motivo || ''
      }));

      tarjetasHtml += `
      <div id="${idAcordeon}" class="tarjeta-hud-sutran bg-[#121212] border border-gray-800 rounded-lg hover:border-${colorTailwind}-500/50 transition-colors shadow-sm relative flex flex-col overflow-hidden group cursor-pointer p-2 min-h-0"
           data-search="${dataSearchStr}" onclick="${accionClic}">

          <i class="fa-solid ${iconClass} text-${baseColor}-500/10 absolute -bottom-3 -left-4 text-[6rem] z-0 pointer-events-none"></i>

          <div class="flex justify-between items-start w-full relative z-10 mb-0.5">
              <h4 class="text-${colorTailwind}-400 font-bold text-[10px] uppercase leading-tight text-left flex-1 pr-2 mt-0.5">${ubicacionStr}</h4>
              <div class="shrink-0 ml-2">
                  ${badgeEstado}
              </div>
          </div>

          <div class="flex flex-col items-end text-right w-full pl-6 relative z-10 space-y-0.5">
              <p class="text-gray-500 text-[8px] font-console"><i class="fa-regular fa-clock"></i> ${fechaStr}</p>

              <div class="w-full overflow-hidden text-[10px] text-gray-200 font-extrabold uppercase leading-tight smart-marquee-box relative">
                  <div class="smart-marquee-text whitespace-nowrap inline-block">${eventoStr}</div>
              </div>

              <p class="text-gray-400 text-[8px] font-bold uppercase italic">${tipoAlertaStr} <span class="text-gray-600 font-console font-normal ml-1">(Ubigeo: ${ubigeoStr})</span></p>
              <p class="text-gray-500 text-[8px] font-console uppercase">FUENTE: <span class="text-cyan-500 font-bold">${fuenteStr}</span></p>
          </div>

          <div class="flex justify-between items-end w-full relative z-20 mt-1 pt-1 border-t border-gray-800/50">
              <button onclick="abrirModalSutran(event, '${dataModal}')" 
                      class="w-6 h-6 flex items-center justify-center border border-gray-700 rounded bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors">
                  <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
              </button>
              <div class="flex items-center gap-1 text-[8px] text-sky-500/80 font-console">
                  <i class="fa-solid fa-location-dot"></i> <span>${lat != null ? lat.toFixed(5) : '?'}, ${lng != null ? lng.toFixed(5) : '?'}</span>
              </div>
          </div>
      </div>
      `;
    } catch(e) { console.error("Error procesando Sutran:", e); }
  });

  // Construir cabecera y lista
  const gravesSutran = counts.sutran.interrumpido + counts.sutran.restringido;
  const topFechaStr = formatearFechaPeru(topAlerta.fechaHora_evento) || '-';

  const headerHtml = `
  <div class="sticky top-0 bg-[#0a0a0a] z-[100] w-full pt-3 pb-2 border-b border-gray-800 shadow-[0_10px_20px_rgba(0,0,0,0.8)] px-0">
      <div class="px-3">
          <div class="bg-[#161a16] border border-cyan-900/30 rounded-lg p-3 mb-3 relative overflow-hidden flex shadow-lg">
              <i class="fa-solid fa-road-barrier text-cyan-500/5 absolute -right-4 -bottom-4 text-7xl"></i>
              <div class="w-1/3 flex flex-col justify-center border-r border-gray-700/50 pr-3">
                  <h3 class="text-cyan-500 font-bold tracking-widest uppercase text-[10px] mb-1">SUTRAN</h3>
                  <span class="text-cyan-500 font-bold text-5xl font-console leading-none" id="hud-contador-sutran">${gravesSutran}</span>
                  <span class="text-gray-500 font-console text-[8px] uppercase mt-1">/ ${totalAlertas} TOTALES</span>
              </div>
              <div class="w-2/3 pl-3 text-right flex flex-col items-end justify-center relative z-10">
                  <span class="border border-cyan-800/50 text-cyan-500 px-2 py-0.5 rounded text-[8px] font-console tracking-wider uppercase mb-1 flex items-center gap-1 shadow-sm">
                      <span class="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span> Último evento
                  </span>
                  <p class="pr-2 text-gray-400 text-[9px] font-console line-clamp-1 mb-1" id="hud-last-time-sutran"><i class="fa-regular fa-clock"></i> ${topFechaStr}</p>
                  <h4 class="font-bold text-gray-200 text-[10px] leading-tight pr-2 uppercase line-clamp-2" id="hud-last-alert-sutran">
                      <span class="text-gray-500 font-console">${topAlerta.ubicación || '-'}</span> <span class="mx-1 text-cyan-500/50">|</span> ${topAlerta.evento || ''}
                  </h4>
              </div>
          </div>
          <div class="relative">
              <i class="fa-solid fa-crosshairs absolute left-3 top-2.5 text-gray-500 text-sm"></i>
              <input type="text" id="buscador-sutran" onkeyup="filtrarRadarSutran(this.value)" 
                     class="w-full bg-[#121212] border border-gray-700 text-gray-300 text-xs rounded-md focus:ring-cyan-500 focus:border-cyan-500 block pl-9 p-2 font-console placeholder-gray-600 outline-none transition-colors" 
                     placeholder="Interceptar: Vía, Restricción, Ubigeo...">
          </div>
      </div>
  </div>
  <div id="lista-tarjetas-sutran" class="pl-3 pr-1 flex flex-col gap-2 p-3 pb-10 px-0 mt-2">
      ${tarjetasHtml}
  </div>
  `;

  htmlListaSutran = headerHtml;

  // Actualizar HUD del mapa
  if(document.getElementById('hud-sutran-count')) document.getElementById('hud-sutran-count').innerText = gravesSutran;
  if(document.getElementById('hud-sutran-total')) document.getElementById('hud-sutran-total').innerText = "/ " + counts.sutran.total + " TOTALES";
  if(document.getElementById('hud-contador-sutran')) document.getElementById('hud-contador-sutran').innerText = gravesSutran;

  // Si el sidebar está abierto, refrescar lista
  if(document.getElementById('lista-tarjetas-sutran')) {
    document.getElementById('lista-tarjetas-sutran').innerHTML = tarjetasHtml;
    setTimeout(() => {
      if (typeof activarMarqueesInteligentes === 'function') activarMarqueesInteligentes();
    }, 100);
  }

  if(document.getElementById('hud-last-alert-sutran')) document.getElementById('hud-last-alert-sutran').innerHTML = `<span class="text-gray-500 font-console">${topAlerta.ubicación || '-'}</span> <span class="mx-1 text-cyan-500/50">|</span> ${topAlerta.evento || ''}`;
  if(document.getElementById('hud-last-time-sutran')) document.getElementById('hud-last-time-sutran').innerHTML = `<i class="fa-regular fa-clock"></i> ${topFechaStr}`;

  // Filtro táctico
  window.filtrarRadarSutran = function(termino) {
    termino = termino.toLowerCase().trim();
    const tarjetas = document.querySelectorAll('.tarjeta-hud-sutran');
    let visibles = 0;
    tarjetas.forEach(tarjeta => {
      const dataSearch = tarjeta.getAttribute('data-search') || '';
      if (dataSearch.includes(termino)) {
        tarjeta.style.display = 'block';
        visibles++;
      } else {
        tarjeta.style.display = 'none';
      }
    });
    const contador = document.getElementById('hud-contador-sutran');
    if (contador) {
      contador.innerText = visibles;
      contador.classList.toggle('text-gray-600', visibles === 0);
      contador.classList.toggle('text-cyan-500', visibles > 0);
    }
  };
}

let miniMapSutran = null;
let miniMapMarkerSutran = null;

window.abrirModalSutran = function(event, dataStringUrlEncoded) {
  event.stopPropagation();
  const data = JSON.parse(decodeURIComponent(dataStringUrlEncoded));

  document.getElementById('modal-sutran-ubicacion').innerText = data.ubicacion;
  document.getElementById('modal-sutran-estado').innerText = data.estado;
  document.getElementById('modal-sutran-fecha').innerText = data.fecha;
  document.getElementById('modal-sutran-tipo').innerText = data.tipo_alerta;
  document.getElementById('modal-sutran-evento').innerText = data.evento;
  document.getElementById('modal-sutran-ubigeo').innerText = data.ubigeo;
  document.getElementById('modal-sutran-fuente').innerText = data.fuente;
  document.getElementById('modal-sutran-motivo').innerText = data.motivo;
  document.getElementById('modal-sutran-coords').innerText = `${data.lat}, ${data.lng}`;

  const modal = document.getElementById('modal-captura-sutran');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.querySelector('.transform').classList.remove('scale-95');
    modal.querySelector('.transform').classList.add('scale-100');
  }, 10);

  modal.onclick = function(e) {
    if (e.target === modal) cerrarModalSutran();
  };

  setTimeout(() => {
    const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    if (!miniMapSutran) {
      miniMapSutran = L.map('minimapa-sutran', { zoomControl: false, attributionControl: true }).setView([data.lat, data.lng], 16);
      L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap' }).addTo(miniMapSutran);
    } else {
      miniMapSutran.setView([data.lat, data.lng], 16);
    }
    miniMapSutran.invalidateSize();

    if (miniMapMarkerSutran) miniMapSutran.removeLayer(miniMapMarkerSutran);
    const customIcon = L.divIcon({
      html: `<div class="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-white border-2 border-white shadow-[0_0_15px_rgba(0,0,0,0.5)] animate-bounce"><i class="fa-solid fa-road-barrier text-sm"></i></div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
    miniMapMarkerSutran = L.marker([data.lat, data.lng], { icon: customIcon }).addTo(miniMapSutran);
  }, 250);
};

window.cerrarModalSutran = function() {
  const modal = document.getElementById('modal-captura-sutran');
  modal.onclick = null;
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => { modal.classList.add('hidden'); }, 200);
};

    //////////////////////////////////////////////////////////////////////////////////////////
    // ================== 2. PROCESAR IGP ==============================================
    //////////////////////////////////////////////////////////////////////////////////////////

    if(datos.igp && datos.igp.length > 0) {
      datos.igp.sort((a, b) => parseDateGlobal(b['Fecha y Hora']) - parseDateGlobal(a['Fecha y Hora']));
      let builderHtmlIgp = '<div class="space-y-2 font-sans">';
      datos.igp.forEach(function(row, idx) {
         try {
           counts.igp.total++;
           var lat = parseFloat(row['Latitud']);
           var lng = parseFloat(row['Longitud']);
           var magVal = parseFloat(row['Magnitud']);
           var mag = row['Magnitud'] || '-';
           
           let colorTailwind = 'green';
           let estadoIgp = 'LEVE';
           let layerId = 'IGP_LEVE';

           if (magVal >= 6.0) { colorTailwind = 'red'; estadoIgp = 'ALTO'; counts.igp.alto++; layerId = 'IGP_ALTO'; } 
           else if (magVal >= 4.5) { colorTailwind = 'yellow'; estadoIgp = 'MODERADO'; counts.igp.moderado++; layerId = 'IGP_MODERADO'; }
           else { counts.igp.leve++; }
           
           if (!isNaN(lat) && !isNaN(lng)) {
              var idAcord = 'acord-igp-' + idx;
              var iconIgp = L.divIcon({
                 html: '<div class="w-5 h-5 rounded-full bg-' + colorTailwind + '-500 icon-marker marker-rumble flex items-center justify-center text-white dark:text-gray-900"><i class="fa-solid fa-hill-rockslide text-[12px]"></i></div>',
                 className: '', iconSize: [20, 20], iconAnchor: [10, 10]
              });
              let marker = L.marker([lat, lng], { icon: iconIgp }).on('click', function() {
                  enfocarDesdeMapa(lat, lng, idAcord, colorTailwind, 'ALERTAS IGP');
              }).bindTooltip('<b class="font-sans text-[10px] uppercase text-'+colorTailwind+'-500">SISMO M ' + mag + '</b><br><span class="text-[9px] dark:text-gray-300">' + (row['Referencia'] || '') + '</span>', { className: 'custom-tooltip' });
              allMarkers.push({ marker: marker, layerId: layerId });
           }

           var idAcord = 'acord-igp-' + idx;
           var accionClic = (!isNaN(lat) && !isNaN(lng)) ? "clickDesdeSidebar(" + lat + ", " + lng + ", '" + idAcord + "', '" + colorTailwind + "')" : "";

           builderHtmlIgp += '<div class="bg-white dark:bg-[#121212] border border-gray-200 dark:border-neutral-800 rounded shadow-sm hover:border-' + colorTailwind + '-500/50 transition-colors cursor-pointer overflow-hidden" onclick="' + accionClic + '">' +
              '<div class="p-2.5 flex items-start gap-2">' +
                '<div class="w-1 h-6 rounded bg-' + colorTailwind + '-500 mt-1 shrink-0"></div>' +
                '<div class="flex-1">' +
                  '<div class="flex justify-between items-start mb-0.5">' +
                    '<h4 class="font-bold text-gray-900 dark:text-gray-200 text-[10px] leading-tight pr-2 uppercase">SISMO M ' + mag + '</h4>' +
                    '<span class="text-' + colorTailwind + '-500 text-[8px] font-console px-1 border border-' + colorTailwind + '-500/30 rounded bg-' + colorTailwind + '-500/10 uppercase shrink-0">' + estadoIgp + '</span>' +
                  '</div>' +
                  '<p class="text-[9px] text-gray-500 dark:text-gray-500 font-medium truncate w-56 md:w-64"><i class="fa-solid fa-location-arrow"></i> ' + (row['Referencia'] || '-') + '</p>' +
                '</div>' +
              '</div>' +
              '<div id="' + idAcord + '" class="expand-content bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-100 dark:border-neutral-800 px-3">' +
                '<div class="grid grid-cols-2 gap-2 mb-2 mt-3">' +
                  '<div><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">Fecha y hora</p><p class="text-[10px] text-gray-800 dark:text-gray-300">' + (formatearFechaPeru(row['Fecha y Hora']) || '-') + '</p></div>' +
                  '<div><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">Profundidad</p><p class="text-[10px] text-gray-800 dark:text-gray-300 uppercase">' + (row['Profundidad'] || '-') + '</p></div>' +
                  '<div><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">ID Reporte</p><p class="text-[10px] text-gray-800 dark:text-gray-300">' + (row['ID Reporte'] || '-') + '</p></div>' +
                  '<div><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">Intensidad Máxima</p><p class="text-[10px] text-gray-800 dark:text-gray-300">' + (row['Intensidad'] || '-') + '</p></div>' +
                '</div>' +
                '<p class="text-[9px] text-blue-600 dark:text-blue-500 font-console text-center pb-2"><i class="fa-solid fa-earth-americas"></i> ' + lat + ', ' + lng + '</p>' +
              '</div>' +
            '</div>';

         } catch(e) {}
      });
      htmlListaIgp = builderHtmlIgp + '</div>';
      let cardIgp = document.querySelector('div[onclick*="ALERTAS IGP"] p.text-xl');
      if (cardIgp) cardIgp.innerText = datos.igp.length;
    }

    //////////////////////////////////////////////////////////////////////////////////////////
    // ================== 3. PROCESAR BOMBEROS ==============================================
    //////////////////////////////////////////////////////////////////////////////////////////

    if(datos.bomberos && datos.bomberos.length > 0) {
      // FIX TÁCTICO: Forzar orden cronológico (del más nuevo al más viejo)
      datos.bomberos.sort(function(a, b) {
          return parseDateGlobal(b['Fecha y Hora']) - parseDateGlobal(a['Fecha y Hora']);
      });
      
      const totalAlertas = datos.bomberos.length;
      const topAlerta = datos.bomberos[0]; // Capturamos la emergencia más reciente para el HUD
      
      // Procesamiento del último evento para la cabecera
      let topTipoRaw = (topAlerta['Tipo de Emergencia'] || '').toUpperCase();
      let topPartes = topTipoRaw.split('/');
      let topTitulo = topPartes[0].trim() || 'EMERGENCIA';
      let topEvento = topPartes.slice(1).join(' / ').trim() || 'SIN DETALLE';
      let topDireccion = topAlerta['Direccion'] || 'Sin dirección';

      let builderHtmlBomberos = '';

      // --- 1. CABECERA HUD ESTÁTICA Y SONDA DE BÚSQUEDA ---
      builderHtmlBomberos += `
      <div class="sticky top-0 bg-[#0a0a0a] z-10 pb-4 border-b border-gray-800 mb-4 pt-2">
          <h3 class="text-white font-bold tracking-widest uppercase mb-3 text-xs">
              <i class="fa-solid fa-fire-extinguisher text-red-500 mr-2"></i>Alertas Bomberos 24h (CGBVP)
          </h3>
          
          <div class="bg-[#121212] border border-gray-800 rounded-lg p-3 mb-3 shadow-lg relative overflow-hidden group">
               <div class="absolute top-0 left-0 w-full h-0.5 bg-red-500/50"></div>
              
              <div class="flex items-center gap-4">
                  <div class="text-center shrink-0 pr-4 border-r border-gray-800">
                      <p class="text-[7px] text-gray-600 font-console uppercase mb-1">Alertas</p>
                      <span class="text-red-500 font-bold text-4xl font-console leading-none" id="hud-contador-bomberos">${totalAlertas}</span>
                  </div>
                  
                  <div class="flex-1">
                      <div class="flex justify-between items-center mb-1">
                          <span class="text-red-400 font-bold text-[9px] tracking-widest uppercase">Último Despacho</span>
                          <div class="relative flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </div>
                      </div>
                      <h4 class="font-bold text-gray-200 text-[10px] leading-tight pr-2 uppercase line-clamp-1 mb-1">${topTitulo}</h4>
                      <p class="text-gray-400 text-[9px] font-bold leading-snug uppercase line-clamp-1 mb-1">${topEvento}</p>
                      <p class="text-amber-500/80 text-[8px] font-console line-clamp-1"><i class="fa-solid fa-location-arrow mr-1"></i>${topDireccion}</p>
                  </div>
              </div>
          </div>

          <div class="relative">
              <i class="fa-solid fa-crosshairs absolute left-3 top-2.5 text-gray-500 text-sm"></i>
              <input type="text" id="buscador-bomberos" onkeyup="filtrarRadarBomberos(this.value)" 
                     class="w-full bg-[#121212] border border-gray-700 text-gray-300 text-xs rounded-md focus:ring-red-500 focus:border-red-500 block pl-9 p-2 font-console placeholder-gray-600 outline-none transition-colors" 
                     placeholder="Interceptar: Tipo, Parte, Ubicación...">
          </div>
      </div>

      <div id="lista-tarjetas-bomberos" class="flex flex-col gap-3 pb-10 font-sans">
      `;

      // --- 2. BUCLE DE TARJETAS (Single-Card Design) ---

    // ================== 4. PROCESAR BOMBEROS (REDISEÑO HUD & ITEM) ==================
    if(datos.bomberos && datos.bomberos.length > 0) {
      
      datos.bomberos.sort((a, b) => parseDateGlobal(b['Fecha y Hora']) - parseDateGlobal(a['Fecha y Hora']));
      
      const totalAlertas = datos.bomberos.length;
      const topAlerta = datos.bomberos[0]; 
      
      let tarjetasHtml = '';  

      // --- 1. BUCLE DE TARJETAS (Construcción y Conteo) ---
      datos.bomberos.forEach(function(row, idx) {
         try {
           counts.cgbvp.total++;
           var lat = parseFloat(row['Latitud']);
           var lng = parseFloat(row['Longitud']);
           
           var estadoBomb = (row['Estado'] || '').toUpperCase();
           let isCerrado = !estadoBomb.includes('ATENDIENDO');
           if (isCerrado) counts.cgbvp.cerrado++; // Usamos sus contadores globales
           
           let tipoEmergenciaRaw = (row['Tipo de Emergencia'] || '').toUpperCase();
           let partesEmergencia = tipoEmergenciaRaw.split('/');
           let tituloEmergencia = partesEmergencia[0].trim();
           let eventoEmergencia = partesEmergencia.slice(1).join(' / ').trim() || 'SIN DETALLE ADICIONAL';
           
           let iconClass = 'fa-fire'; let baseColor = 'red'; let typeKey = 'SERVESP';
           if (tituloEmergencia.includes('ACCIDENTE VEHICULAR')) { iconClass = 'fa-car-burst'; baseColor = 'red'; typeKey = 'ACCVEH'; }
           else if (tituloEmergencia.includes('MEDICA') || tituloEmergencia.includes('MÉDICA')) { iconClass = 'fa-truck-medical'; baseColor = 'amber'; typeKey = 'EMERGMED'; }
           else if (tituloEmergencia.includes('INCENDIO')) { iconClass = 'fa-fire'; baseColor = 'red'; typeKey = 'INCENDIO'; }
           else if (tituloEmergencia.includes('MAT') || tituloEmergencia.includes('PELIGROSOS')) { iconClass = 'fa-biohazard'; baseColor = 'red'; typeKey = 'MATPEL'; }
           else if (tituloEmergencia.includes('RESCATE')) { iconClass = 'fa-life-ring'; baseColor = 'amber'; typeKey = 'RESCATE'; }

           let colorTailwind = isCerrado ? 'gray' : baseColor;
           
           let badgeEstado = isCerrado
               ? `<span class="bg-transparent border border-gray-600 text-gray-400 px-1.5 py-0.5 rounded text-[8px] font-console tracking-wider uppercase flex items-center gap-1 shadow-sm"><i class="fa-solid fa-check text-[8px]"></i>CERRADO</span>`
               : `<span class="bg-transparent border border-red-800/80 text-red-500 px-1.5 py-0.5 rounded text-[8px] font-console tracking-wider uppercase flex items-center gap-1 shadow-sm"><i class="fa-solid fa-headset text-[8px] animate-pulse"></i>ATENDIENDO</span>`;

           // ID TÁCTICO ESTRICTO (Para el enfoque desde el mapa)
           var idAcord = 'acord-bomb-' + idx;
           
           if (!isNaN(lat) && !isNaN(lng)) {
              let layerId = isCerrado ? 'CGBVP_CERRADO' : 'CGBVP_' + typeKey;
              var iconBomb = L.divIcon({
                 html: `<div class="w-5 h-5 rounded-full bg-${colorTailwind}-500 icon-marker marker-rumble flex items-center justify-center text-white dark:text-gray-900"><i class="fa-solid ${iconClass} text-[12px]"></i></div>`,
                 className: '', iconSize: [20, 20], iconAnchor: [10, 10]
              });
              let marker = L.marker([lat, lng], { icon: iconBomb }).on('click', function() {
                 enfocarDesdeMapa(lat, lng, idAcord, colorTailwind, 'ALERTAS CGBVP');
              }).bindTooltip(`<b class="font-sans text-[10px] uppercase text-${colorTailwind}-500">${row['Nro Parte'] || 'Emergencia'}</b><br><span class="text-[9px] dark:text-gray-300">${tituloEmergencia}</span>`, { className: 'custom-tooltip' });
              allMarkers.push({ marker: marker, layerId: layerId });
           }

           var accionClic = (!isNaN(lat) && !isNaN(lng)) ? `clickDesdeSidebar(${lat}, ${lng}, '${idAcord}', '${colorTailwind}')` : "";
           var maquinasStr = (row['Maquinas'] || 'En ruta').replace(/<[^>]+>/g, '').trim();
           if(maquinasStr === "") maquinasStr = "En ruta";
           let direccionStr = row['Direccion'] || '-';
           let nroParteStr = row['Nro Parte'] || '-';
           
           // Hora Local Directa
           let fechaStr = formatearFechaPeru(row['Fecha y Hora']) || '-';

           let dataSearchStr = `${tituloEmergencia} ${eventoEmergencia} ${direccionStr} ${nroParteStr} ${maquinasStr} ${estadoBomb}`.toLowerCase();
           let dataModal = encodeURIComponent(JSON.stringify({
               lat: lat, lng: lng, tipo: tituloEmergencia, nro: nroParteStr,
               dir: direccionStr, evento: eventoEmergencia, maq: maquinasStr, fecha: fechaStr, icon: iconClass, color: colorTailwind
           }));

           // --- TARJETA ITEM: TÍTULO IZQ, DATOS DER ---
           tarjetasHtml += `
           <div id="${idAcord}" class="tarjeta-hud-bombero bg-[#121212] border border-gray-800 rounded-lg hover:border-${colorTailwind}-500/50 transition-colors shadow-sm relative flex flex-col overflow-hidden group cursor-pointer p-2 min-h-0"
                data-search="${dataSearchStr}" onclick="${accionClic}">
                
               <i class="fa-solid ${iconClass} text-${colorTailwind}-500/10 absolute -bottom-3 -left-4 text-[6rem] z-0 pointer-events-none"></i>
               
               <div class="flex justify-between items-start w-full relative z-10 mb-0.5">
                   <h4 class="text-${colorTailwind}-400 font-bold text-[10px] uppercase leading-tight text-left flex-1 pr-2 mt-0.5">${tituloEmergencia}</h4>
                   <div class="shrink-0 ml-2">
                       ${badgeEstado}
                   </div>
               </div>

               <div class="flex flex-col items-end text-right w-full pl-6 relative z-10 space-y-0.5">
                   <p class="text-gray-500 text-[8px] font-console"><i class="fa-regular fa-clock"></i> ${fechaStr}</p>
                   
                   <div class="w-full overflow-hidden text-[10px] text-gray-200 font-extrabold uppercase leading-tight smart-marquee-box relative">
    <div class="smart-marquee-text whitespace-nowrap inline-block">${direccionStr}</div>
</div>
                   
                   <p class="text-gray-400 text-[8px] font-bold uppercase italic">${eventoEmergencia} <span class="text-gray-600 font-console font-normal ml-1">(N° ${nroParteStr})</span></p>
                   <p class="text-gray-500 text-[8px] font-console uppercase">MÁQUINAS: <span class="text-amber-500 font-bold">${maquinasStr}</span></p>
               </div>

               <div class="flex justify-between items-end w-full relative z-20 mt-1 pt-1 border-t border-gray-800/50">
                   <button onclick="abrirModalBombero(event, '${dataModal}')" 
                           class="w-6 h-6 flex items-center justify-center border border-gray-700 rounded bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors">
                       <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                   </button>
                   <div class="flex items-center gap-1 text-[8px] text-sky-500/80 font-console">
                       <i class="fa-solid fa-location-dot"></i> <span>${lat}, ${lng}</span>
                   </div>
               </div>
           </div>
           `;
         } catch(e) { console.error("Error procesando bombero:", e); }
      });

      // --- 2. CÁLCULO DE ALERTAS ACTIVAS ---
      // Replicamos la misma lógica que usted usó para asegurar números idénticos
      let gravesCGBVP = counts.cgbvp.total - counts.cgbvp.cerrado;

      // --- 3. CABECERA HUD SIDEBAR (Cero Padding, 100% Ancho) ---
      let topTipoRaw = (topAlerta['Tipo de Emergencia'] || '').toUpperCase();
      let topTitulo = topTipoRaw.split('/')[0].trim() || 'EMERGENCIA';
      let topFechaStr = formatearFechaPeru(topAlerta['Fecha y Hora']) || '-';

      let headerHtml = `
      <div class="sticky top-0 bg-[#0a0a0a] z-[100] w-full pt-3 pb-2 border-b border-gray-800 shadow-[0_10px_20px_rgba(0,0,0,0.8)] px-0">
          <div class="px-3">

              <div class="bg-[#1a1616] border border-red-900/30 rounded-lg p-3 mb-3 relative overflow-hidden flex shadow-lg">
                  <i class="fa-solid fa-fire text-red-500/5 absolute -right-4 -bottom-4 text-7xl"></i>
                  
                  <div class="w-1/3 flex flex-col justify-center border-r border-gray-700/50 pr-3">
                      <h3 class="text-red-500 font-bold tracking-widest uppercase text-[10px] mb-1">BOMBEROS 24H</h3>
                      <span class="text-red-500 font-bold text-5xl font-console leading-none" id="hud-contador-bomberos">${gravesCGBVP}</span>
                      <span class="text-gray-500 font-console text-[8px] uppercase mt-1">/ ${totalAlertas} EN TOTAL</span>
                  </div>
                  
                  <div class="w-2/3 pl-3 text-right flex flex-col items-end justify-center relative z-10">
                      <span class="border border-red-800/50 text-red-500 px-2 py-0.5 rounded text-[8px] font-console tracking-wider uppercase mb-1 flex items-center gap-1 shadow-sm">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> ${topTitulo}
                      </span>
                      <p class="text-gray-400 text-[9px] font-console line-clamp-1 mb-1" id="hud-last-time-bomberos"><i class="fa-regular fa-clock"></i> ${topFechaStr}</p>
                      <h4 class="font-bold text-gray-200 text-[10px] leading-tight pr-2 uppercase line-clamp-2" id="hud-last-alert-bomberos">
     ${topAlerta['Direccion'] || ''}<span class="mx-1 text-red-500/50">|</span><span class="text-gray-500 font-console">N° ${topAlerta['Nro Parte'] || '-'}</span></h4>
                  </div>
              </div>

              <div class="relative">
                  <i class="fa-solid fa-crosshairs absolute left-3 top-2.5 text-gray-500 text-sm"></i>
                  <input type="text" id="buscador-bomberos" onkeyup="filtrarRadarBomberos(this.value)" 
                         class="w-full bg-[#121212] border border-gray-700 text-gray-300 text-xs rounded-md focus:ring-red-500 focus:border-red-500 block pl-9 p-2 font-console placeholder-gray-600 outline-none transition-colors" 
                         placeholder="Interceptar: Tipo, Parte, Ubicación...">
              </div>
          </div>
      </div>

      <div id="lista-tarjetas-bomberos" class="pl-3 pr-1 flex flex-col gap-2 p-3 pb-10 px-0 mt-2">
          ${tarjetasHtml}
      </div>
      `;

      htmlListaBomberos = headerHtml;

      // =========================================================
      // ⚡ ACTUALIZACIÓN EN VIVO DE HUDS GLOBALES (MAPA Y SIDEBAR)
      // =========================================================
      
      // 1. Actualiza el HUD del MAPA (usando los IDs que usted me proporcionó)
      if(document.getElementById('hud-cgbvp-count')) document.getElementById('hud-cgbvp-count').innerText = gravesCGBVP;
      if(document.getElementById('hud-cgbvp-total')) document.getElementById('hud-cgbvp-total').innerText = "/ " + counts.cgbvp.total + " EN TOTAL";
      
      // 2. Actualiza los Contadores del Sidebar (Si el panel está abierto)
      if(document.getElementById('hud-contador-bomberos')) document.getElementById('hud-contador-bomberos').innerText = gravesCGBVP;
      
      // 3. Actualiza la lista de tarjetas en vivo (Si el panel está abierto)
if(document.getElementById('lista-tarjetas-bomberos')) {
    document.getElementById('lista-tarjetas-bomberos').innerHTML = tarjetasHtml;
    
    // ⚡ NUEVO: Reevaluar los anchos con la data fresca
    setTimeout(() => {
        if (typeof activarMarqueesInteligentes === 'function') activarMarqueesInteligentes();
    }, 100);
}
      
      // 4. Actualiza los detalles de la última alerta en la Cabecera del Sidebar (En vivo)
      if(document.getElementById('hud-last-alert-bomberos')) document.getElementById('hud-last-alert-bomberos').innerHTML = `<span class="text-gray-500 font-console">N° ${topAlerta['Nro Parte'] || '-'}</span> <span class="mx-1 text-red-500/50">|</span> ${topAlerta['Direccion'] || ''}`;
      if(document.getElementById('hud-last-time-bomberos')) document.getElementById('hud-last-time-bomberos').innerHTML = `<i class="fa-regular fa-clock"></i> ${topFechaStr}`;

    }
 /**
 * SONDA DE FILTRADO TÁCTICO
 * Intercepta pulsaciones de teclado y filtra el radar de bomberos en tiempo real.
 */
    window.filtrarRadarBomberos = function(termino) {
        termino = termino.toLowerCase().trim();
    
    // Capturamos todas las tarjetas usando la clase que les asignamos
    const tarjetas = document.querySelectorAll('.tarjeta-hud-bombero');
    let visibles = 0;

    tarjetas.forEach(tarjeta => {
        // Leemos la memoria oculta de la tarjeta (data-search)
        const dataSearch = tarjeta.getAttribute('data-search') || "";
        
        if (dataSearch.includes(termino)) {
            tarjeta.style.display = 'block'; // Mostrar
            visibles++;
        } else {
            tarjeta.style.display = 'none';  // Ocultar
        }
    });

    // Actualizamos el Contador HUD
    const contador = document.getElementById('hud-contador-bomberos');
    if (contador) {
        contador.innerText = visibles;
        if (visibles === 0) {
            contador.classList.replace('text-red-500', 'text-gray-600');
        } else {
            contador.classList.replace('text-gray-600', 'text-red-500');
        }
    }
};

let miniMapBombero = null;
let miniMapMarker = null;

/**
 * ABRE EL MODAL DE CAPTURA
 */

window.abrirModalBombero = function(event, dataStringUrlEncoded) {
    event.stopPropagation(); // BLOQUEA el click principal de la tarjeta
    const data = JSON.parse(decodeURIComponent(dataStringUrlEncoded));
    
    document.getElementById('modal-bomb-tipo').innerText = data.tipo;
    document.getElementById('modal-bomb-dir').innerText = data.dir;
    document.getElementById('modal-bomb-evento').innerText = data.evento;
    document.getElementById('modal-bomb-nro').innerText = data.nro;
    document.getElementById('modal-bomb-fecha').innerText = data.fecha;
    document.getElementById('modal-bomb-maq').innerText = data.maq;
    
    // Inyectar Coordenadas en el Modal
    const coordsEl = document.getElementById('modal-bomb-coords');
    if (coordsEl) coordsEl.innerText = `${data.lat}, ${data.lng}`;
    
    const iconEl = document.getElementById('modal-bomb-icon');
    iconEl.className = `fa-solid ${data.icon} text-${data.color}-500`;

    const modal = document.getElementById('modal-captura-bombero');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
        modal.querySelector('.transform').classList.add('scale-100');
    }, 10);

    modal.onclick = function(e) {
        if (e.target === modal) cerrarModalBombero();
    };

    setTimeout(() => {
        const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

        if (!miniMapBombero) {
            miniMapBombero = L.map('minimapa-bombero', { zoomControl: false, attributionControl: true }).setView([data.lat, data.lng], 16);
            L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap' }).addTo(miniMapBombero);
            
            const attContainer = document.querySelector('.leaflet-control-attribution');
            if (attContainer) attContainer.classList.add('leaflet-custom-theme', 'font-console');
        } else {
            miniMapBombero.setView([data.lat, data.lng], 16);
        }

        miniMapBombero.invalidateSize();
        
        // ⚡ RESTAURACIÓN DEL MARCADOR
        if (miniMapMarker) miniMapBombero.removeLayer(miniMapMarker);
        
        // Creación del icono táctico
        let customIcon = L.divIcon({
             html: `<div class="w-8 h-8 rounded-full bg-${data.color}-500 flex items-center justify-center text-white border-2 border-white shadow-[0_0_15px_rgba(0,0,0,0.5)] animate-bounce"><i class="fa-solid ${data.icon} text-sm"></i></div>`,
             className: '', 
             iconSize: [32, 32], 
             iconAnchor: [16, 32] // Punto de anclaje exacto en la punta inferior
        });
        
        // Añadir el marcador a las coordenadas de la tarjeta
        miniMapMarker = L.marker([data.lat, data.lng], { icon: customIcon }).addTo(miniMapBombero);
        
    }, 250); 
};

window.cerrarModalBombero = function() {
    const modal = document.getElementById('modal-captura-bombero');
    
    // Eliminamos el onclick para evitar ejecuciones fantasmas
    modal.onclick = null; 

    modal.querySelector('.transform').classList.remove('scale-100');
    modal.querySelector('.transform').classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 200);
};

    //////////////////////////////////////////////////////////////////////////////////////////
    // ================== 5. PROCESAR SEDES ==============================================
    //////////////////////////////////////////////////////////////////////////////////////////
    
    if(datos.sedes && datos.sedes.length > 0) {
      datos.sedes.forEach(function(row) {
        try {
          counts.sedes.total++;
          let lat = null, lng = null;
          let coordsStr = String(row['Coordenadas'] || '').replace(/['"]/g, ''); 
          if (coordsStr.includes(',')) {
            let pts = coordsStr.split(',');
            lat = parseFloat(pts[0].trim()); lng = parseFloat(pts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) {
              let iconSede = L.divIcon({
                 html: '<div class="w-6 h-6 rounded-md bg-blue-600 icon-marker flex items-center justify-center text-white dark:text-gray-900"><i class="fa-solid fa-warehouse text-[14px]"></i></div>',
                 className: '', iconSize: [24, 24], iconAnchor: [12, 12]
              });
              let nombreSede = row['Sede'] || 'Sede Dinet';
              let direccionSede = row['Dirección'] || row['Direccion'] || 'Sin dirección registrada';
              let negocioSede = row['Negocio'] || 'DINET';
              
              let tooltipHtml = '<div class="flex flex-col gap-1 min-w-[130px]">' +
                                   '<b class="font-sans text-[11px] uppercase text-blue-500 leading-tight">' + nombreSede + '</b>' +
                                   '<span class="text-[9px] text-gray-600 dark:text-gray-400 leading-tight mb-0.5"><i class="fa-solid fa-location-dot"></i> ' + direccionSede + '</span>' +
                                   '<div><span class="bg-blue-500/10 text-blue-500 border border-blue-500/30 px-1.5 py-0.5 rounded text-[8px] font-console uppercase">' + negocioSede + '</span></div>' +
                                '</div>';
              let marker = L.marker([lat, lng], { icon: iconSede })
                           .bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -10], className: 'custom-tooltip' });
              allMarkers.push({ marker: marker, layerId: 'SEDES' });
            }
          }
        } catch(e) {}
      });
    }

    // ================== 5.5 PROCESAR DICAPI (FUSIÓN NAVAL) ==================
    let ultimoPuerto = null;
    let ultimaFechaCambioDicapi = 0;
    
    if (datos.dicapi && datos.dicapi.length > 0) {
        if (!sysMemory.dicapi || sysMemory.dicapi instanceof Set) { sysMemory.dicapi = {}; }
        
        let puertosPorCapitania = {};
        let idMarcadoresNuevos = [];
        ultimaDataDicapi = datos.dicapi; 

        datos.dicapi.forEach(function(row, idx) {
            try {
                counts.dicapi.total++;
                let pCapitania = row['CAPITANÍA'] || "DESCONOCIDA";
                let pNombre = row['NOMBRE DEL PUERTO'] || "SIN NOMBRE";
                let pNivel = row['NIVEL'] || "N/A";
                let estadoTxt = String(row['ESTADO LOGÍSTICO']).trim();
                let lat = parseFloat(row['LATITUD']);
                let lng = parseFloat(row['LONGITUD']);
                let fechaFormat = row['FECHA REPORTE'];
                let resolucion = row['RESOLUCIÓN MGP'] || "S/N";

                let tipoAlerta = "VERDE"; 
                let statusClass = "dicapi-icon-green";
                let colorTailwind = "green";
                let layerId = "DICAPI_VERDE";
                let txtEstadoFront = "ABIERTO";
                let zIndexOffset = 0;

                if (estadoTxt.indexOf("Cierre Parcial") !== -1) {
                    tipoAlerta = "AMBAR"; counts.dicapi.ambar++; colorTailwind = "amber"; layerId = "DICAPI_AMBAR"; statusClass = "dicapi-icon-amber"; txtEstadoFront = "PARCIAL"; zIndexOffset = 500;
                } else if (estadoTxt.indexOf("Cierre Total") !== -1) {
                    tipoAlerta = "ROJO"; counts.dicapi.rojo++; colorTailwind = "red"; layerId = "DICAPI_ROJO"; statusClass = "dicapi-icon-red"; txtEstadoFront = "CERRADO"; zIndexOffset = 1000;
                } else {
                    counts.dicapi.verde++;
                }

                let fechaReporteUnix = parseDateGlobal(fechaFormat);
                if (tipoAlerta !== "VERDE" && fechaReporteUnix > ultimaFechaCambioDicapi) {
                    ultimaFechaCambioDicapi = fechaReporteUnix;
                    ultimoPuerto = { nombre: pNombre, capitania: pCapitania, estado: tipoAlerta, fechaTxt: fechaFormat };
                }

                let estadoGuardado = sysMemory.dicapi[pNombre];
                let tempPulseClass = "";
                if (tipoAlerta !== "VERDE" && estadoGuardado !== undefined && estadoGuardado !== tipoAlerta) {
                    tempPulseClass = "dicapi-pulse-temp-" + colorTailwind + " temp-pulse-dicapi-" + idx;
                    idMarcadoresNuevos.push("temp-pulse-dicapi-" + idx);
                    if (!isFirstLoad) triggerCardAlarm("ESTADO DE PUERTOS");
                }
                sysMemory.dicapi[pNombre] = tipoAlerta;

                if (!puertosPorCapitania[pCapitania]) puertosPorCapitania[pCapitania] = { abiertas: 0, parciales: 0, cerradas: 0, puertos: [] };
                if (tipoAlerta === "ROJO") puertosPorCapitania[pCapitania].cerradas++;
                else if (tipoAlerta === "AMBAR") puertosPorCapitania[pCapitania].parciales++;
                else puertosPorCapitania[pCapitania].abiertas++;

                let idAcord = "acord-dicapi-" + idx;
                puertosPorCapitania[pCapitania].puertos.push({
                    nombre: pNombre, lat: lat, lng: lng, idAcordeon: idAcord, colorTailwind: colorTailwind, txtEstadoFront: txtEstadoFront, nivel: pNivel, resolucion: resolucion, estado: tipoAlerta
                });

                if (!isNaN(lat) && !isNaN(lng)) {
                    let htmlIcon = "<div class='custom-dicapi-icon " + statusClass + " " + tempPulseClass + "'></div>";
                    let icon = L.divIcon({ className: "div-icon-dicapi-wrapper", html: htmlIcon, iconSize: [10, 10], iconAnchor: [5, 5], tooltipAnchor: [5, 0] });
                    let tooltipContent = "<b class='font-sans text-[10px] uppercase text-" + colorTailwind + "-500'><i class='fa-solid fa-anchor'></i> " + pNombre + "</b><br><span class='text-[9px] dark:text-gray-300'>Capitanía: " + pCapitania + "</span>";
                    let marker = L.marker([lat, lng], { icon: icon, zIndexOffset: zIndexOffset })
                        .on("click", function() { enfocarDesdeMapa(lat, lng, idAcord, colorTailwind, "ESTADO DE PUERTOS"); })
                        .bindTooltip(tooltipContent, { className: "custom-tooltip", direction: "top", offset: [0, -6] });
                    
                    allMarkers.push({ marker: marker, layerId: layerId });
                }
            } catch(e) {}
        });

        if (idMarcadoresNuevos.length > 0) {
            setTimeout(() => {
                idMarcadoresNuevos.forEach(idClass => {
                    document.querySelectorAll("." + idClass).forEach(el => el.classList.remove("dicapi-pulse-temp-red", "dicapi-pulse-temp-amber", idClass));
                });
            }, 30000);
        }

        globalDicapiCounts = { total: counts.dicapi.total, rojo: counts.dicapi.rojo, ambar: counts.dicapi.ambar, verde: counts.dicapi.verde };

        if (document.getElementById("dicapi-count")) document.getElementById("dicapi-count").innerText = counts.dicapi.rojo + counts.dicapi.ambar;
        if (document.getElementById("dicapi-total")) document.getElementById("dicapi-total").innerText = counts.dicapi.total;

        let badgeContainer = document.getElementById("hud-dicapi-badge");
        let wrapper = document.getElementById("hud-dicapi-last"); 
        if (wrapper && badgeContainer) {
            if (ultimoPuerto) {
                let color = ultimoPuerto.estado === "ROJO" ? "red" : "amber";
                let txtEst = ultimoPuerto.estado === "ROJO" ? "CERRADO" : "PARCIAL";
                badgeContainer.innerHTML = "<span class='bg-" + color + "-500/10 text-" + color + "-500 border border-" + color + "-500/30 px-1.5 py-[1px] rounded text-[9px] font-console uppercase tracking-widest flex items-center gap-1.5 dark:shadow-[0_0_5px_rgba(0,0,0,0.5)]'><div class='w-1.5 h-1.5 rounded-full bg-" + color + "-500 animate-pulse shadow-[0_0_4px_currentColor]'></div> " + txtEst + "</span>";
                wrapper.innerHTML = "<span class='text-[9px] font-console text-gray-400 leading-none uppercase flex items-center justify-end gap-1 w-full'><i class='fa-regular fa-clock'></i> " + ultimoPuerto.fechaTxt + "</span>" +
                                     "<span class='truncate block text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight mt-1.5 mb-0.5 uppercase text-right w-full' title='" + ultimoPuerto.nombre + "'>" + ultimoPuerto.nombre + "</span>" +
                                     "<span class='truncate block text-[9.5px] text-gray-500 font-bold uppercase text-right w-full'>CAPITANÍA: " + ultimoPuerto.capitania + "</span>";
            } else {
                badgeContainer.innerHTML = "<span class='bg-green-500/10 text-green-500 border border-green-500/30 px-1.5 py-[1px] rounded text-[9px] font-console uppercase tracking-widest flex items-center gap-1.5'><div class='w-1.5 h-1.5 rounded-full bg-green-500'></div> ABIERTO</span>";
                wrapper.innerHTML = "<span class='text-[9px] font-console text-gray-400 leading-none uppercase flex items-center justify-end gap-1 w-full'><i class='fa-regular fa-clock'></i> --/--/---- --:--:--</span>" +
                                     "<span class='truncate block text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight mt-1.5 mb-0.5 uppercase text-right w-full'>TODOS LOS PUERTOS</span>" +
                                     "<span class='truncate block text-[9.5px] text-gray-500 font-bold uppercase text-right w-full'>SISTEMA NORMAL</span>";
            }
        }

        let htmlConstructor = "<div class='space-y-3 font-sans px-1'>";
        Object.keys(puertosPorCapitania).sort().forEach(capName => {
            let cat = puertosPorCapitania[capName];
            cat.puertos.sort((a, b) => { let peso = { "ROJO": 3, "AMBAR": 2, "VERDE": 1 }; return peso[b.estado] - peso[a.estado]; });
            
            htmlConstructor += "<div class='bg-gray-100 dark:bg-[#1a1a1a] border border-gray-300 dark:border-neutral-700 rounded p-2 shadow-sm mb-3'>" +
                "<h3 class='font-bold text-gray-800 dark:text-gray-200 text-[11px] uppercase tracking-widest mb-2 flex items-center gap-2 border-b border-gray-200 dark:border-neutral-600 pb-1'>" +
                    "<i class='fa-solid fa-building-flag text-blue-500'></i> CAPITANÍA: " + capName +
                "</h3>" +
                "<div class='flex gap-2 mb-2'>" +
                    "<span class='text-[9px] bg-red-500/10 text-red-500 border border-red-500/30 px-1.5 rounded font-console' title='Cerrados'>" + cat.cerradas + " <i class='fa-solid fa-lock'></i></span>" +
                    "<span class='text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-1.5 rounded font-console' title='Parciales'>" + cat.parciales + " <i class='fa-solid fa-lock-open'></i></span>" +
                    "<span class='text-[9px] bg-green-500/10 text-green-500 border border-green-500/30 px-1.5 rounded font-console' title='Abiertos'>" + cat.abiertas + " <i class='fa-solid fa-check'></i></span>" +
                "</div>" +
                "<div class='space-y-1.5'>";

            cat.puertos.forEach(p => {
                let accionClic = "clickDesdeSidebar(" + p.lat + ", " + p.lng + ", '" + p.idAcordeon + "', '" + p.colorTailwind + "')";
                htmlConstructor += "<div class='bg-white dark:bg-[#121212] border border-gray-200 dark:border-neutral-800 rounded hover:border-" + p.colorTailwind + "-500/50 cursor-pointer overflow-hidden' onclick=\"" + accionClic + "\">" +
                    "<div class='p-2 flex items-center justify-between'>" +
                        "<div class='flex items-center gap-2'>" +
                            "<span class='w-2 h-2 rounded-full bg-" + p.colorTailwind + "-500 shrink-0'></span>" +
                            "<span class='text-[10px] font-bold text-gray-800 dark:text-gray-200 uppercase truncate w-40'>" + p.nombre + "</span>" +
                        "</div>" +
                        "<span class='text-[8px] font-console bg-" + p.colorTailwind + "-500/10 text-" + p.colorTailwind + "-500 border border-" + p.colorTailwind + "-500/30 px-1 rounded uppercase tracking-wider shrink-0'>" + p.txtEstadoFront + "</span>" +
                    "</div>" +
                    "<div id='" + p.idAcordeon + "' class='expand-content bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-100 dark:border-neutral-800 px-3'>" +
                        "<div class='grid grid-cols-2 gap-2 mb-2 mt-2'>" +
                            "<div><p class='text-[8px] text-gray-400 font-console uppercase tracking-wide'>Nivel</p><p class='text-[9px] text-gray-800 dark:text-gray-300 font-bold uppercase'>" + p.nivel + "</p></div>" +
                            "<div><p class='text-[8px] text-gray-400 font-console uppercase tracking-wide'>Capitanía</p><p class='text-[9px] text-gray-800 dark:text-gray-300 font-bold uppercase'>" + capName + "</p></div>" +
                            "<div class='col-span-2'><p class='text-[8px] text-gray-400 font-console uppercase tracking-wide'>Resolución MGP</p><p class='text-[9px] text-gray-800 dark:text-gray-300 uppercase'>" + p.resolucion + "</p></div>" +
                        "</div>" +
                        "<p class='text-[9px] text-blue-600 dark:text-blue-500 font-console text-center pb-2'><i class='fa-solid fa-earth-americas'></i> " + p.lat + ", " + p.lng + "</p>" +
                    "</div>" +
                "</div>";
            });
            htmlConstructor += "</div></div>";
        });
        htmlListaPuertos = htmlConstructor + "</div>";

        let titleEl = document.getElementById("sidebar-title");
        if (titleEl && titleEl.innerText === "ESTADO DE PUERTOS") {
            document.getElementById("sidebar-content").innerHTML = htmlListaPuertos;
        }
    }

    // ================== 6. PROCESAR ALERTAS CECOM ==================
    let lastCecomMatched = null; // Guardamos para la tarjeta del HUD
    if(datos.cecom && datos.cecom.length > 0) {
      datos.cecom.sort(function(a, b) { 
          let kFA = Object.keys(a).find(k => k.toLowerCase().includes('fecha'));
          let kFB = Object.keys(b).find(k => k.toLowerCase().includes('fecha'));
          let fA = kFA ? a[kFA] : ''; let fB = kFB ? b[kFB] : '';
          return parseDateGlobal(fB) - parseDateGlobal(fA); 
      });

      let builderHtmlCecom = '<div class="space-y-2 font-sans">';
      let activas = 0;

      datos.cecom.forEach(function(row, idx) {
         try {
           let keys = Object.keys(row);
           let keyEst = keys.find(k => k.toLowerCase().includes('estado'));
           let keyFecha = keys.find(k => k.toLowerCase().includes('fecha'));
           let keyUbi = keys.find(k => k.toLowerCase().includes('ubicaci'));
           let keyDesc = keys.find(k => k.toLowerCase().includes('descrip'));
           let keyCod = keys.find(k => k.toLowerCase().includes('codigo') || k.toLowerCase().includes('código'));
           let keyCoord = keys.find(k => k.toLowerCase().includes('coord'));

           let estado = keyEst ? String(row[keyEst]).toUpperCase() : '';
           if(!estado.includes('ACTIVO')) return; 
           
           if(activas === 0) lastCecomMatched = row; // Capturamos el más reciente
           activas++;
           counts.cecom.total++;
           
           let riesgo = (row['Nivel Riesgo'] || '').toUpperCase();
           let colorTailwind = riesgo.includes('ALTO') ? 'red' : 'yellow';
           let layerId = riesgo.includes('ALTO') ? 'CECOM_ALTO' : 'CECOM_MEDIO';
           if(riesgo.includes('ALTO')) counts.cecom.alto++; else counts.cecom.medio++;

           let lat = null, lng = null;
           let coordsStr = keyCoord ? String(row[keyCoord]) : '';
           if (coordsStr.includes(',')) {
             let pts = coordsStr.split(','); lat = parseFloat(pts[0].trim()); lng = parseFloat(pts[1].trim());
           }

           let fechaStr = keyFecha ? row[keyFecha] : '-';
           let ubi = keyUbi ? row[keyUbi] : '-';
           let desc = keyDesc ? row[keyDesc] : '-';
           let cod = keyCod ? row[keyCod] : '-';
           let tipoEve = row['Tipo Evento'] || 'EVENTO';

           if (!isNaN(lat) && !isNaN(lng)) {
              let idAcord = 'acord-cecom-' + idx;
              
              let iconCecom = L.divIcon({ html: '<div class="w-5 h-5 rounded-full bg-' + colorTailwind + '-500 icon-marker marker-rumble flex items-center justify-center text-white dark:text-gray-900"><i class="fa-solid fa-satellite-dish text-[12px] animate-pulse"></i></div>', className: '', iconSize: [20, 20], iconAnchor: [10, 10] });

              let marker = L.marker([lat, lng], { icon: iconCecom }).on('click', function() { enfocarDesdeMapa(lat, lng, idAcord, colorTailwind, 'ALERTAS SAM'); }).bindTooltip('<b class="font-sans text-[10px] uppercase text-'+colorTailwind+'-500">CECOM: ' + tipoEve + '</b><br><span class="text-[9px] dark:text-gray-300">' + ubi + '</span>', { className: 'custom-tooltip' });
              allMarkers.push({ marker: marker, layerId: layerId });
           }

           let idAcord = 'acord-cecom-' + idx;
           let accionClic = (!isNaN(lat) && !isNaN(lng)) ? "clickDesdeSidebar(" + lat + ", " + lng + ", '" + idAcord + "', '" + colorTailwind + "')" : "";
           
           builderHtmlCecom += '<div class="bg-white dark:bg-[#121212] border border-gray-200 dark:border-neutral-800 rounded shadow-sm hover:border-' + colorTailwind + '-500/50 cursor-pointer overflow-hidden" onclick="' + accionClic + '"><div class="p-2.5 flex items-start gap-2"><div class="w-1 h-6 rounded bg-' + colorTailwind + '-500 mt-1 shrink-0"></div><div class="flex-1"><div class="flex justify-between items-start mb-0.5"><h4 class="font-bold text-gray-900 dark:text-gray-200 text-[10px] leading-tight pr-2 uppercase">' + tipoEve + '</h4><span class="text-' + colorTailwind + '-500 text-[8px] font-console px-1 border border-' + colorTailwind + '-500/30 rounded bg-' + colorTailwind + '-500/10 uppercase shrink-0">' + riesgo + '</span></div><p class="text-[9px] text-gray-500 truncate w-56"><i class="fa-solid fa-location-arrow"></i> ' + ubi + '</p></div></div><div id="' + idAcord + '" class="expand-content bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-100 dark:border-neutral-800 px-3"><div class="grid grid-cols-2 gap-2 mb-2 mt-3"><div><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">Fecha</p><p class="text-[10px] text-gray-800 dark:text-gray-300">' + fechaStr + '</p></div><div><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">Codigo</p><p class="text-[10px] text-gray-800 dark:text-gray-300 font-console">' + cod + '</p></div><div class="col-span-2"><p class="text-[8px] text-gray-400 font-console uppercase tracking-wide">Detalles</p><p class="text-[10px] text-gray-800 dark:text-gray-300">' + desc + '</p></div></div><p class="text-[9px] text-blue-600 dark:text-blue-500 font-console text-center pb-2"><i class="fa-solid fa-earth-americas"></i> ' + coordsStr + '</p></div></div>';
         } catch(e) {}
      });
      htmlListaCecom = activas > 0 ? (builderHtmlCecom + '</div>') : '<div class="text-center text-gray-500 py-10 font-console">No hay alertas SAM activas.</div>';
      
      let cecomCardCount = document.getElementById('hud-cecom-count');
      if(cecomCardCount) cecomCardCount.innerText = activas;

    } else {
      htmlListaCecom = '<div class="text-center text-gray-500 py-10 font-console">No hay alertas SAM activas.</div>';
      if(document.getElementById('hud-cecom-count')) document.getElementById('hud-cecom-count').innerText = '0';
    }

    // Dibujar la leyenda (filtros) y pintar el mapa
    globalCounts = counts; 
    buildLayerPanel(counts);
    applyLayerFilters();

    // =========================================================================
    // INYECCIÓN DE TARJETAS DEL HUD INFERIOR (FORMATO SIMÉTRICO v4.0)
    // =========================================================================
    let genMarquee = (text, cls) => {
        if(!text || text === '-' || text === '') return `<span class="truncate block text-[9.5px] ${cls} uppercase w-full">-</span>`;
        if(text.length > 35) return `<marquee scrollamount="3" class="block text-[9.5px] ${cls} uppercase w-full">${text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${text}</marquee>`;
        return `<span class="truncate block text-[9.5px] ${cls} uppercase w-full">${text}</span>`;
    };

    // HUD 1: SUTRAN
if(datos.sutran && datos.sutran.length > 0) {
   let graves = counts.sutran.interrumpido + counts.sutran.restringido;
   if(document.getElementById('hud-sutran-count')) document.getElementById('hud-sutran-count').innerText = graves;
   if(document.getElementById('hud-sutran-total')) document.getElementById('hud-sutran-total').innerText = "/ " + counts.sutran.total + " TOTALES";
   
   // Usamos la misma lógica del rediseño: la más reciente ya es datos.sutran[0]
   let lastSutran = datos.sutran[0];
   if(document.getElementById('hud-sutran-last') && lastSutran) {
       let sEst = (lastSutran.estado || 'NORMAL').toUpperCase().replace('TRÁNSITO ', '').replace('TRANSITO ', '').trim();
       let sCol = sEst.includes('INTERRUMPIDO') ? 'red' : (sEst.includes('RESTRINGIDO') ? 'amber' : 'green');
       
       // Badge de estado
       let bBadge = `<span class="bg-${sCol}-500/10 text-${sCol}-500 border border-${sCol}-500/30 px-1.5 py-[1px] rounded text-[9px] font-console uppercase tracking-widest flex items-center gap-1.5 dark:shadow-[0_0_5px_rgba(0,0,0,0.5)]"><div class="w-1.5 h-1.5 rounded-full bg-${sCol}-500 animate-pulse shadow-[0_0_4px_currentColor]"></div> ${sEst}</span>`;
       if(document.getElementById('hud-sutran-badge')) document.getElementById('hud-sutran-badge').innerHTML = bBadge;

       // Fecha formateada
       let dDate = `<span class="text-[9px] font-console text-gray-400 leading-none uppercase flex items-center justify-end gap-1 w-full"><i class="fa-regular fa-clock"></i> ${formatearFechaPeru(lastSutran.fechaHora_evento)}</span>`;
       let locSutran = (lastSutran.ubicación || '') + ' - ' + (lastSutran.evento || '');
       let row3 = `<span class="truncate block text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight mt-1.5 mb-0.5 uppercase text-right w-full" title="${locSutran}">${locSutran}</span>`;
       let row4 = genMarquee(lastSutran.evento || lastSutran.motivo || '-', 'text-gray-500 font-bold text-right');
       
       document.getElementById('hud-sutran-last').innerHTML = dDate + row3 + row4;
   }
}

    // HUD 2: BOMBEROS
    if(datos.bomberos && datos.bomberos.length > 0) {
       let gravesCGBVP = counts.cgbvp.total - counts.cgbvp.cerrado;
       if(document.getElementById('hud-cgbvp-count')) document.getElementById('hud-cgbvp-count').innerText = gravesCGBVP;
       if(document.getElementById('hud-cgbvp-total')) document.getElementById('hud-cgbvp-total').innerText = "/ " + counts.cgbvp.total + " EN TOTAL";
       
       let lastB = datos.bomberos.find(r => r['Estado'].toUpperCase().includes('ATENDIENDO')) || datos.bomberos[0];
       if(document.getElementById('hud-cgbvp-last')) {
           let tFull = (lastB['Tipo de Emergencia'] || '').toUpperCase().replace(/</g, "&lt;").replace(/>/g, "&gt;");
           let pB = tFull.split('/');
           let tM = pB[0].trim();
           let tD = pB.slice(1).join(' / ').trim() || 'SIN DETALLE';
           
           let bTyp = 'INCENDIO'; let bC = 'red';
           if(tM.includes('ACC')) { bTyp = 'ACC. VEHICULAR'; bC='red'; }
           else if(tM.includes('MED')||tM.includes('MÉD')) { bTyp = 'EMERG. MÉDICA'; bC='amber'; }
           else if(tM.includes('MAT')||tM.includes('PEL')) { bTyp = 'MAT. PELIGROSOS'; bC='red'; }
           else if(tM.includes('RESC')) { bTyp = 'RESCATE'; bC='amber'; }
           else if(tM.includes('ESP')) { bTyp = 'SERV. ESPECIAL'; bC='amber'; }
           if(!lastB['Estado'].toUpperCase().includes('ATENDIENDO')) { bTyp = 'CERRADO'; bC='green'; }
           
          // Inyectar Badge Bomberos (Sombra adaptable)
          let bBadgeB =
          `<span class="bg-${bC}-500/10 text-${bC}-500 border border-${bC}-500/30 px-1.5 py-[1px] rounded text-[9px] font-console uppercase tracking-widest flex items-center gap-1.5 dark:shadow-[0_0_5px_rgba(0,0,0,0.5)]"><div class="w-1.5 h-1.5 rounded-full bg-${bC}-500 animate-pulse shadow-[0_0_4px_currentColor]"></div> ${bTyp}</span>`;
          if(document.getElementById('hud-cgbvp-badge')) document.getElementById('hud-cgbvp-badge').innerHTML = bBadgeB;

           let dDateB = `<span class="text-[9px] font-console text-gray-400 leading-none uppercase flex items-center justify-end gap-1 w-full"><i class="fa-regular fa-clock"></i> ${formatearFechaPeru(lastB['Fecha y Hora'])}</span>`;
           let locB = (lastB['Direccion'] || '-').replace(/</g, "&lt;").replace(/>/g, "&gt;");
           let row3B = `<span class="truncate block text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight mt-1.5 mb-0.5 uppercase text-right w-full" title="${locB}">${locB}</span>`;
           let row4B = genMarquee(tD, 'text-gray-500 font-bold text-right');
           
           document.getElementById('hud-cgbvp-last').innerHTML = dDateB + row3B + row4B;
       }
    }

    // HUD 3: IGP
    if(datos.igp && datos.igp.length > 0) {
       let lastIgp = datos.igp[0];
       let magVal = parseFloat(lastIgp['Magnitud']);
       let iCol = magVal >= 6.0 ? 'red' : (magVal >= 4.5 ? 'amber' : 'green');
       
       let elMag = document.getElementById('hud-igp-mag');
       if(elMag) {
           elMag.innerText = lastIgp['Magnitud'] || '-.-';
           elMag.className = `text-[36px] font-bold font-console leading-none block text-${iCol}-500`; 
       }
       if(document.getElementById('hud-igp-total')) document.getElementById('hud-igp-total').innerText = "/ " + counts.igp.total + " SISMOS";
       
       if(document.getElementById('hud-igp-last')) {
           let iEst = magVal >= 6.0 ? 'RIESGO ALTO' : (magVal >= 4.5 ? 'RIESGO MOD.' : 'RIESGO LEVE');
           
           let bBadgeI = `<span class="bg-${iCol}-500/10 text-${iCol}-500 border border-${iCol}-500/30 px-1.5 py-[1px] rounded text-[9px] font-console uppercase tracking-widest flex items-center gap-1.5 dark:shadow-[0_0_5px_rgba(0,0,0,0.5)]"><div class="w-1.5 h-1.5 rounded-full bg-${iCol}-500 animate-pulse shadow-[0_0_4px_currentColor]"></div> ${iEst}</span>`;
 if(document.getElementById('hud-igp-badge')) document.getElementById('hud-igp-badge').innerHTML = bBadgeI;

           let dDateI = `<span class="text-[9px] font-console text-gray-400 leading-none uppercase flex items-center justify-end gap-1 w-full"><i class="fa-regular fa-clock"></i> ${formatearFechaPeru(lastIgp['Fecha y Hora'])}</span>`;
           let locI = lastIgp['Referencia'] || '-';
           let row3I = `<span class="truncate block text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight mt-1.5 mb-0.5 uppercase text-right w-full" title="${locI}">${locI}</span>`;
           let row4I = `<span class="truncate block text-[9.5px] text-gray-500 font-bold uppercase w-full text-right">INTENSIDAD: ${lastIgp['Intensidad'] || '-'}</span>`;
           
           document.getElementById('hud-igp-last').innerHTML = dDateI + row3I + row4I;
       }
    }

    // HUD 4: CECOM
    let cecomCardLast = document.getElementById('hud-cecom-last');
    if(cecomCardLast) {
       if(lastCecomMatched) {
           let cCol = (lastCecomMatched['Nivel Riesgo']||'').toUpperCase().includes('ALTO') ? 'red' : 'amber';
           let cEst = (lastCecomMatched['Tipo Evento']||'EVENTO').toUpperCase();
           let kF = Object.keys(lastCecomMatched).find(k => k.toLowerCase().includes('fecha'));
           let kU = Object.keys(lastCecomMatched).find(k => k.toLowerCase().includes('ubicaci'));
           let kD = Object.keys(lastCecomMatched).find(k => k.toLowerCase().includes('descrip'));
           
          let bBadgeC =
          `<span class="bg-${cCol}-500/10 text-${cCol}-500 border border-${cCol}-500/30 px-1.5 py-[1px] rounded text-[9px] font-console uppercase tracking-widest flex items-center gap-1.5 dark:shadow-[0_0_5px_rgba(0,0,0,0.5)]"><div class="w-1.5 h-1.5 rounded-full bg-${cCol}-500 animate-pulse shadow-[0_0_4px_currentColor]"></div> ${cEst}</span>`;
          if(document.getElementById('hud-cecom-badge')) document.getElementById('hud-cecom-badge').innerHTML = bBadgeC;

           let dDateC = `<span class="text-[9px] font-console text-gray-400 leading-none uppercase flex items-center justify-end gap-1 w-full"><i class="fa-regular fa-clock"></i> ${formatearFechaPeru(kF ? lastCecomMatched[kF] : '-')}</span>`;
           let locC = kU ? lastCecomMatched[kU] : '-';
           let row3C = `<span class="truncate block text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight mt-1.5 mb-0.5 uppercase text-right w-full" title="${locC}">${locC}</span>`;
           let descC = kD ? lastCecomMatched[kD] : '-';
           let row4C = genMarquee(descC, 'text-gray-500 font-bold text-right');
           
           cecomCardLast.innerHTML = dDateC + row3C + row4C;
       } else {
           cecomCardLast.innerHTML = '<span class="text-gray-500 text-[10px] uppercase text-right w-full block">Sin alertas registradas.</span>';
           if(document.getElementById('hud-cecom-badge')) document.getElementById('hud-cecom-badge').innerHTML = '';
       }
    }
    applyLayerFilters();
    applyDicapiFilters();
    isFirstLoad = false;
  }
}

// ========== SIDEBARS ==========
function openSidebar(modulo) {
  const sidebar = document.getElementById('right-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const titleEl = document.getElementById('sidebar-title');
  const contentEl = document.getElementById('sidebar-content');

  if (titleEl.innerHTML !== modulo) {
    titleEl.innerHTML = modulo;
    if (modulo === 'ALERTAS SUTRAN') contentEl.innerHTML = htmlListaSutran;
    else if (modulo === 'ALERTAS IGP') contentEl.innerHTML = htmlListaIgp;
    else if (modulo === 'ALERTAS CGBVP') contentEl.innerHTML = htmlListaBomberos;
    else if (modulo === 'ESTADO DE PUERTOS') contentEl.innerHTML = htmlListaPuertos;
    else if (modulo === 'ALERTAS SAM') contentEl.innerHTML = htmlListaCecom;
    else contentEl.innerHTML = '<div class="text-center opacity-50 pt-20">Módulo en construcción</div>';
  }
  sidebar.classList.remove('sidebar-closed');
  sidebar.classList.add('sidebar-open');
  overlay.classList.remove('hidden');
  forceMapRepaint();

  // ⚡ NUEVO: Disparar la sonda después de la animación de apertura
  // Usamos 300ms para asegurar que el panel ya se expandió y los anchos son reales
  setTimeout(() => {
      if (typeof activarMarqueesInteligentes === 'function') {
          activarMarqueesInteligentes();
      }
  }, 300);
}

function closeSidebar() {
  const sidebar = document.getElementById('right-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.add('sidebar-closed');
  sidebar.classList.remove('sidebar-open');
  overlay.classList.add('hidden');
  forceMapRepaint();
}

// ========== CAPAS Y LEYENDA ==========
function toggleLayerPanel() {
  const panel = document.getElementById('layer-control');
  panel.classList.toggle('hidden');
}

function buildLayerPanel(counts) {
      const content = document.getElementById('layer-content');
      
      // Inteligencia Táctica: Si hay al menos un hijo activo, el Padre se marca automáticamente
      let chkCctv = layerState['LIVE_CAMS']; // <-- NUEVO
      let chkSutran = layerState['SUTRAN_INTERRUMPIDO'] || layerState['SUTRAN_RESTRINGIDO'] || layerState['SUTRAN_NORMAL'];
      let chkCgbvp = layerState['CGBVP_INCENDIO'] || layerState['CGBVP_MATPEL'] || layerState['CGBVP_ACCVEH'] || layerState['CGBVP_EMERGMED'] || layerState['CGBVP_RESCATE'] || layerState['CGBVP_SERVESP'] || layerState['CGBVP_CERRADO'];
      let chkIgp = layerState['IGP_ALTO'] || layerState['IGP_MODERADO'] || layerState['IGP_LEVE'];
      let chkDicapi = layerState['DICAPI_ROJO'] || layerState['DICAPI_AMBAR'] || layerState['DICAPI_VERDE'];
      let chkCecom = layerState['CECOM_ALTO'] || layerState['CECOM_MEDIO'];

      content.innerHTML = `
        <div class="space-y-4">
            
            <div>
               <div>
               <div class="font-bold text-cyan-600 dark:text-cyan-400 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-cyan-500 transition-colors m-0">
                      <input type="checkbox" id="group-CCTV" onchange="toggleLayer('LIVE_CAMS')" ${chkCctv ? 'checked' : ''} class="accent-cyan-500">
                      <span><i class="fa-solid fa-video mr-1"></i> Intercepción CCTV</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded font-console">${dataCCTVGlobal.length}</span>
               </div>
            </div>

               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-orange-500 transition-colors m-0">
                      <input type="checkbox" id="group-SUTRAN" onchange="toggleGroup('SUTRAN')" ${chkSutran ? 'checked' : ''} class="accent-orange-500">
                      <span>Alertas SUTRAN</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.sutran.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('SUTRAN_INTERRUMPIDO')" ${layerState['SUTRAN_INTERRUMPIDO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Interrumpido (${counts.sutran.interrumpido})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('SUTRAN_RESTRINGIDO')" ${layerState['SUTRAN_RESTRINGIDO']?'checked':''} class="accent-yellow-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block"></span> Restringido (${counts.sutran.restringido})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('SUTRAN_NORMAL')" ${layerState['SUTRAN_NORMAL']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Normal (${counts.sutran.normal})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-red-500 transition-colors m-0">
                      <input type="checkbox" id="group-CGBVP" onchange="toggleGroup('CGBVP')" ${chkCgbvp ? 'checked' : ''} class="accent-red-500">
                      <span>Alertas CGBVP</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.cgbvp.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_INCENDIO')" ${layerState['CGBVP_INCENDIO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Incendio (${counts.cgbvp.incendio})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_MATPEL')" ${layerState['CGBVP_MATPEL']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Mat. Peligrosos (${counts.cgbvp.matpel})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_ACCVEH')" ${layerState['CGBVP_ACCVEH']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Acc. Vehicular (${counts.cgbvp.accveh})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_EMERGMED')" ${layerState['CGBVP_EMERGMED']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Emerg. Médica (${counts.cgbvp.emergmed})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_RESCATE')" ${layerState['CGBVP_RESCATE']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Rescate (${counts.cgbvp.rescate})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_SERVESP')" ${layerState['CGBVP_SERVESP']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Serv. Especial (${counts.cgbvp.servesp})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_CERRADO')" ${layerState['CGBVP_CERRADO']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Cerrados (${counts.cgbvp.cerrado})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-amber-500 transition-colors m-0">
                      <input type="checkbox" id="group-IGP" onchange="toggleGroup('IGP')" ${chkIgp ? 'checked' : ''} class="accent-amber-500">
                      <span>Alertas IGP</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.igp.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('IGP_ALTO')" ${layerState['IGP_ALTO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Riesgo Alto (${counts.igp.alto})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('IGP_MODERADO')" ${layerState['IGP_MODERADO']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Riesgo Mod. (${counts.igp.moderado})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('IGP_LEVE')" ${layerState['IGP_LEVE']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Riesgo Leve (${counts.igp.leve})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors m-0">
                      <input type="checkbox" id="group-DICAPI" onchange="toggleGroup('DICAPI')" ${chkDicapi ? 'checked' : ''} class="accent-blue-500">
                      <span>Estado de Puertos</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${globalDicapiCounts.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('DICAPI_ROJO')" ${layerState['DICAPI_ROJO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Cierre Total (${globalDicapiCounts.rojo})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('DICAPI_AMBAR')" ${layerState['DICAPI_AMBAR']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Cierre Parcial (${globalDicapiCounts.ambar})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('DICAPI_VERDE')" ${layerState['DICAPI_VERDE']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Abiertos (${globalDicapiCounts.verde})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors m-0">
                      <input type="checkbox" id="group-CECOM" onchange="toggleGroup('CECOM')" ${chkCecom ? 'checked' : ''} class="accent-blue-500">
                      <span>Alertas SAM</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.cecom ? counts.cecom.total : 0}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CECOM_ALTO')" ${layerState['CECOM_ALTO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span> Riesgo Alto (${counts.cecom ? counts.cecom.alto : 0})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CECOM_MEDIO')" ${layerState['CECOM_MEDIO']?'checked':''} class="accent-yellow-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block animate-pulse shadow-[0_0_5px_rgba(234,179,8,0.8)]"></span> Riesgo Medio (${counts.cecom ? counts.cecom.medio : 0})
                  </label>
               </div>
            </div>           
            
            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between mt-2">
                  <span class="text-purple-500"><i class="fa-solid fa-radar"></i> Capas Analíticas</span>
               </div>
               <div class="space-y-1.5 pl-1">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('HEATMAP')" ${layerState['HEATMAP']?'checked':''} class="accent-purple-500">
                     <i class="fa-solid fa-fire-flame-curved text-purple-500"></i> Densidad de Calor
                  </label>
                  
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase mt-1">
                     <input type="checkbox" onchange="toggleWindLayer()" ${layerState['WIND_FLOW']?'checked':''} class="accent-cyan-400">
                     <i class="fa-solid fa-wind text-cyan-400"></i> Flujo de Viento (GFS)
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors m-0">
                      <input type="checkbox" onchange="toggleLayer('SEDES')" ${layerState['SEDES']?'checked':''} class="accent-blue-500">
                      <span>Instalaciones Propias</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.sedes.total}</span>
               </div>
            </div>

        </div>
      `;
  }

function toggleLayer(layerId) {
  layerState[layerId] = !layerState[layerId];
  if (layerId === 'LIVE_CAMS') {
    if (layerState['LIVE_CAMS']) map.addLayer(layerCCTV);
    else map.removeLayer(layerCCTV);
  }
  applyLayerFilters();
  if (globalCounts) buildLayerPanel(globalCounts);
}

function quickToggleGroup(group) {
      let currentState = false;
      
      // Comprobamos si el grupo está activo
      if (group === 'LIVE_CAMS' || group === 'SEDES') {
          currentState = layerState[group];
      } else {
          for (let key in layerState) {
              if (key.startsWith(group + '_') && layerState[key] === true) {
                  currentState = true; break;
              }
          }
      }
      
      let targetState = !currentState; 

      // Aplicamos el nuevo estado
      if (group === 'LIVE_CAMS' || group === 'SEDES') {
          layerState[group] = targetState;
          if (group === 'LIVE_CAMS') {
              if (targetState) map.addLayer(layerCCTV);
              else map.removeLayer(layerCCTV);
          }
      } else {
          for (let key in layerState) {
              if (key.startsWith(group + '_')) layerState[key] = targetState;
          }
      }

      applyLayerFilters();
      applyDicapiFilters();
      if (globalCounts) buildLayerPanel(globalCounts); 
  }

function applyLayerFilters() {
  markerGroup.clearLayers();
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }

  let heatPoints = [];

  allMarkers.forEach(item => {
    if (layerState[item.layerId]) {
      item.marker.addTo(markerGroup);

      // Recolectar puntos de calor (excepto sedes)
      if (layerState['HEATMAP'] && item.layerId !== 'SEDES') {
        const latlng = item.marker.getLatLng();
        heatPoints.push([latlng.lat, latlng.lng, 1]);
      }
    }
  });

  // Dibujar heatmap si es necesario
  if (layerState['HEATMAP'] && heatPoints.length > 0) {
    heatLayer = L.heatLayer(heatPoints, {
      radius: 20,
      blur: 25,
      maxZoom: 10,
      gradient: { 0.3: '#3b82f6', 0.5: '#22c55e', 0.7: '#eab308', 1.0: '#ef4444' }
    }).addTo(map);
  }
}

function applyDicapiFilters() {
  const estadoKeys = {
    'DICAPI_ROJO': layerState['DICAPI_ROJO'],
    'DICAPI_AMBAR': layerState['DICAPI_AMBAR'],
    'DICAPI_VERDE': layerState['DICAPI_VERDE']
  };

  allMarkers.forEach(item => {
    if (item.layerId.startsWith('DICAPI_')) {
      const show = estadoKeys[item.layerId] === true;
      if (show) {
        if (!markerGroup.hasLayer(item.marker)) item.marker.addTo(markerGroup);
      } else {
        if (markerGroup.hasLayer(item.marker)) markerGroup.removeLayer(item.marker);
      }
    }
  });
}

function syncQuickButtons() {
  const groups = ['LIVE_CAMS', 'SEDES', 'SUTRAN', 'CGBVP', 'DICAPI', 'IGP', 'CECOM', 'HEATMAP', 'WIND_FLOW'];
  groups.forEach(g => {
    const btn = document.getElementById('btn-quick-' + g);
    if (!btn) return;
    const isActive = (g === 'LIVE_CAMS' || g === 'SEDES' || g === 'HEATMAP' || g === 'WIND_FLOW')
      ? layerState[g]
      : Object.keys(layerState).some(k => k.startsWith(g + '_') && layerState[k]);
    btn.classList.toggle('opacity-30', !isActive);
    btn.classList.toggle('grayscale', !isActive);
  });
}

/* ==========================================================
     MÓDULO CCTV: HUD INTEGRADO Y CONTROL DE MAPA (FASE 2)
     ========================================================== */
  let hlsPlayer = null;
  let layerCCTV = L.layerGroup(); // Capa independiente para el mapa
  let dataCCTVGlobal = []; // Memoria táctica de cámaras

  // 1. CONTROL DEL PANEL LATERAL
  function openCCTVSidebar() {
      closeSidebar(); // Cierra el panel normal si estaba abierto
      document.getElementById('sidebar-cctv').classList.remove('translate-x-full');
      document.getElementById('sidebar-overlay').classList.remove('hidden');
  }

  function closeCCTVSidebar() {
      document.getElementById('sidebar-cctv').classList.add('translate-x-full');
      document.getElementById('sidebar-overlay').classList.add('hidden');
      
      // Apagar video al cerrar para ahorrar ancho de banda
      let video = document.getElementById('cctv-player');
      video.pause();
      if(hlsPlayer) {
          hlsPlayer.destroy();
          hlsPlayer = null;
      }
      document.getElementById('cctv-player').classList.add('hidden');
      document.getElementById('cctv-placeholder').classList.remove('hidden');
      document.getElementById('cctv-placeholder').innerText = "ESPERANDO SELECTOR DE TRANSMISIÓN...";
      document.getElementById('cctv-ubicacion').innerText = "STANDBY";
      document.getElementById('cctv-distrito').innerText = "SISTEMA EN ESPERA";
  }

  // 2. CARGAR CÁMARAS DESDE SHEETS
  async function cargarCamarasLive() {
  try {
    const res = await ApiClient.request('/api/v1/sam/camaras');
    const camaras = res.data;

    // Limpiar capa de CCTV previa
    layerCCTV.clearLayers();

    // Construir la lista lateral (sidebar)
    const listContainer = document.getElementById('cctv-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!camaras || camaras.length === 0) {
      listContainer.innerHTML =
        '<div class="text-center text-gray-500 font-console text-xs mt-10">NO SE DETECTARON CÁMARAS ACTIVAS</div>';
      return;
    }

    // Variable para almacenar globalmente
    dataCCTVGlobal = camaras;

    // Procesar cada cámara
    camaras.forEach((cam, index) => {
      // Crear el elemento en la lista lateral
      const itemId = 'cam-item-' + index;
      const card = document.createElement('div');
      card.id = itemId;
      card.className =
        'cursor-pointer hover:bg-cyan-500/10 border border-gray-700 rounded p-2 mb-1 transition-colors';
      card.innerHTML = `
        <p class="text-cyan-400 font-bold text-xs uppercase">${cam.ubicacion}</p>
        <p class="text-gray-400 text-[10px]">${cam.distrito}</p>
      `;
      card.addEventListener('click', () => seleccionarCamaraEnPanel(index));
      listContainer.appendChild(card);

      // Si hay coordenadas, dibujar marcador en el mapa
      if (cam.lat && cam.lng) {
        const iconCCTV = L.divIcon({
          html: `<div class="w-5 h-5 rounded-full bg-cyan-500 icon-marker marker-rumble flex items-center justify-center text-white dark:text-gray-900 shadow-[0_0_8px_rgba(6,182,212,0.6)]">
                  <i class="fa-solid fa-video text-[10px]"></i>
                </div>`,
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const marker = L.marker([parseFloat(cam.lat), parseFloat(cam.lng)], {
          icon: iconCCTV,
          zIndexOffset: 700
        }).addTo(layerCCTV);

        marker.bindTooltip(
          `<b class="font-sans text-[10px] uppercase text-cyan-500">${cam.ubicacion}</b><br>
           <span class="text-[9px] dark:text-gray-300">INTERCEPTAR SEÑAL CCTV</span>`,
          { className: 'custom-tooltip' }
        );

        marker.on('click', () => {
          abrirMatrixNuevaPestana();
        });
      }
    });

    // Respetar el estado de la capa (si está activa, añadirla al mapa)
    if (layerState['LIVE_CAMS']) {
      map.addLayer(layerCCTV);
    }

    // Actualizar leyenda si existe
    if (typeof globalCounts !== 'undefined' && typeof buildLayerPanel === 'function') {
      buildLayerPanel(globalCounts);
    }
  } catch (error) {
    console.error('Error al cargar cámaras:', error);
    // Podrías mostrar un mensaje en la interfaz si lo deseas
  }
}

  // 3. LÓGICA DE SELECCIÓN Y REPRODUCCIÓN
  function seleccionarCamara(index, desdeMapa) {
      let cam = dataCCTVGlobal[index];
      if(!cam) return;

      openCCTVSidebar(); // Asegura que el panel esté abierto

      // A) Actualizar Textos del Header
      document.getElementById('cctv-ubicacion').innerText = cam.ubicacion;
      document.getElementById('cctv-distrito').innerText = "DISTRITO: " + cam.distrito;
      
      // B) Cargar Video
      reproducirVideoHLS(cam.url);
      
      // C) Si se hizo clic desde el panel, volar el mapa hacia la cámara
      if(!desdeMapa && cam.lat && cam.lng) {
          map.flyTo([parseFloat(cam.lat), parseFloat(cam.lng)], 16, { animate: true, duration: 1.5 });
          triggerRadarPing(cam.lat, cam.lng, 'cyan'); // Efecto de radar en el mapa
      }

      // D) Efecto de Resalte de 7 Segundos (Pulso) en el Control
      let itemId = 'cam-item-' + index;
      let card = document.getElementById(itemId);
      if(card) {
          // Desplazar el scroll hacia el control suavemente
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Inyectar variables de color y clase del pulso
          card.style.setProperty('--glow-c', 'rgba(6, 182, 212, 0.8)'); // Cyan
          card.style.setProperty('--border-c', '#06b6d4');
          card.classList.add('card-focus-active');
          
          setTimeout(() => { 
              card.classList.remove('card-focus-active');
              card.style.removeProperty('--glow-c');
              card.style.removeProperty('--border-c');
          }, 7000); // 7 segundos exactos
      }
  }

  // 4. MOTOR HLS (El reproductor)
  function reproducirVideoHLS(url) {
      let video = document.getElementById('cctv-player');
      let loader = document.getElementById('cctv-loader');
      let placeholder = document.getElementById('cctv-placeholder');

      // Preparar interfaz
      placeholder.classList.add('hidden');
      video.classList.remove('hidden');
      loader.classList.remove('hidden');

      if (Hls.isSupported()) {
          if (hlsPlayer) { hlsPlayer.destroy(); }
          hlsPlayer = new Hls();
          hlsPlayer.loadSource(url);
          hlsPlayer.attachMedia(video);
          
          hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
              video.play();
              loader.classList.add('hidden');
          });
          
          hlsPlayer.on(Hls.Events.ERROR, function (event, data) {
              if (data.fatal) {
                  loader.classList.add('hidden');
                  placeholder.innerText = "ERROR EN TRANSMISIÓN (SEÑAL CAÍDA O RESTRINGIDA)";
                  placeholder.classList.remove('hidden');
                  video.classList.add('hidden');
              }
          });
      }
  }

  // 5. MOTOR FULLSCREEN
  function toggleVideoFullScreen() {
      let videoEl = document.getElementById('cctv-player');
      if (!document.fullscreenElement) {
          if (videoEl.requestFullscreen) videoEl.requestFullscreen();
          else if (videoEl.webkitRequestFullscreen) videoEl.webkitRequestFullscreen();
      } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
  }

// ========== ISSE STUDIO ==========
async function abrirISSE() {
  // 1. Interfaz
  const modal = document.getElementById('modal-isse-studio');
  const selector = document.getElementById('isse-client-selector');
  const container = document.getElementById('isse-report-container');

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // 2. Selector con empresa del usuario actual
  selector.innerHTML = `<option value="current">${currentUser.empresa}</option>`;
  selector.disabled = true;
  selector.classList.add('bg-gray-100', 'cursor-not-allowed');

  // 3. Estado de carga
  container.innerHTML = `
    <div class="bg-white p-10 rounded-lg shadow-xl text-center">
      <i class="fa-solid fa-satellite-dish fa-spin text-4xl text-blue-500 mb-4 block"></i>
      <p class="text-gray-500 font-console tracking-widest uppercase">
        Generando Reporte para ${currentUser.empresa}...
      </p>
    </div>`;

  try {
    // 4. Descarga paralela de noticias y efemérides
    const [noticiasRes, efemRes] = await Promise.all([
      ApiClient.request('/api/v1/sam/noticias'),
      ApiClient.request('/api/v1/sam/efemerides')
    ]);

    isseNoticias = noticiasRes.data;
    isseEfemerides = efemRes.data;

    // Construir isseClientes (necesario para renderizarISSE)
    isseClientes = [{
      id: 'current',
      nombre: currentUser.empresa,
      logoBase64: currentUser.logo,
      colores: currentUser.colores,
      correo: currentUser.correo,
      telefono: currentUser.telefono,
      prefijo: currentUser.prefijo,
      telegram: currentUser.telegram
    }];

    renderizarISSE(); // Función existente (genera el reporte visual)
  } catch (error) {
    console.error('Error al cargar datos ISSE:', error);
    container.innerHTML = `
      <div class="bg-white p-10 rounded-lg shadow-xl text-center text-red-500">
        <i class="fa-solid fa-exclamation-triangle text-4xl mb-4"></i>
        <p>Error al cargar los datos del reporte. Intente de nuevo.</p>
      </div>`;
  }
}

function cerrarISSE() {
      const modal = document.getElementById('modal-isse-studio');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
  }


/* =========================================================
   MOTOR DE ASIGNACIÓN ESPACIAL (MACROZONAS PERÚ v4.1 - DERECHA A IZQUIERDA)
   ========================================================= */
function clasificarUbicacion(textoRef, lat, lng) {
    const diccionario = [
        { zona: 'COSTA NORTE', regiones: ['TUMBES', 'PIURA', 'LAMBAYEQUE', 'LA LIBERTAD', 'TALARA', 'PAITA', 'SALAVERRY', 'CHICLAYO', 'TRUJILLO'], lat: -6.77, lng: -79.84, ref: 'LAMBAYEQUE' },
        { zona: 'COSTA CENTRO', regiones: ['ANCASH', 'LIMA', 'CALLAO', 'ICA', 'CHIMBOTE', 'SUPE', 'HUACHO', 'PISCO', 'SAN JUAN', 'CAÑETE', 'HUARMEY'], lat: -12.04, lng: -77.02, ref: 'LIMA' },
        { zona: 'COSTA SUR', regiones: ['AREQUIPA', 'MOQUEGUA', 'TACNA', 'MATARANI', 'ILO'], lat: -16.39, lng: -71.53, ref: 'AREQUIPA' },
        { zona: 'SIERRA NORTE', regiones: ['CAJAMARCA', 'CHOTA', 'JAEN'], lat: -7.16, lng: -78.51, ref: 'CAJAMARCA' },
        { zona: 'SIERRA CENTRO', regiones: ['HUANUCO', 'PASCO', 'JUNIN', 'HUANCAVELICA', 'AYACUCHO', 'HUANCAYO', 'TARMA'], lat: -11.15, lng: -75.99, ref: 'JUNÍN' },
        { zona: 'SIERRA SUR', regiones: ['APURIMAC', 'CUSCO', 'PUNO', 'ABANCAY', 'JULIACA'], lat: -13.52, lng: -71.96, ref: 'CUSCO' },
        { zona: 'SELVA NORTE', regiones: ['AMAZONAS', 'LORETO', 'SAN MARTIN', 'IQUITOS', 'TARAPOTO', 'MOYOBAMBA', 'YURIMAGUAS'], lat: -3.74, lng: -73.25, ref: 'LORETO' },
        { zona: 'SELVA CENTRO', regiones: ['UCAYALI', 'PUCALLPA'], lat: -8.37, lng: -74.55, ref: 'UCAYALI' },
        { zona: 'SELVA SUR', regiones: ['MADRE DE DIOS', 'PUERTO MALDONADO'], lat: -12.59, lng: -69.18, ref: 'MADRE DE DIOS' }
    ];

    let pLat = parseFloat(lat);
    let pLng = parseFloat(lng);
    
    // 1. PRIORIDAD ABSOLUTA: COORDENADAS
    if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) {
        let zonaCercana = 'COSTA CENTRO';
        let regionCercana = 'LIMA';
        let distMinima = 999999;
        diccionario.forEach(d => {
            let dist = Math.sqrt(Math.pow(pLat - d.lat, 2) + Math.pow(pLng - d.lng, 2));
            if (dist < distMinima) { distMinima = dist; zonaCercana = d.zona; regionCercana = d.ref; }
        });
        return { zona: zonaCercana, region: regionCercana };
    }

    // 2. BÚSQUEDA TEXTUAL (Buscando desde el final hacia el inicio)
    let txt = String(textoRef || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
    let matches = [];

    for (let i = 0; i < diccionario.length; i++) {
        for(let j = 0; j < diccionario[i].regiones.length; j++) {
            let kw = diccionario[i].regiones[j];
            let regex = new RegExp("\\b" + kw + "\\b", "g");
            let match;
            while ((match = regex.exec(txt)) !== null) {
                // Guardamos el índice donde encontró la palabra
                matches.push({ zona: diccionario[i].zona, region: kw, index: match.index });
            }
        }
    }

    if (matches.length > 0) {
        // ORDEN TÁCTICO: La palabra que esté más a la derecha en la dirección gana (Ej: Gana ICA sobre Chiclayo)
        matches.sort((a, b) => b.index - a.index);
        return { zona: matches[0].zona, region: matches[0].region };
    }

    return { zona: 'COSTA CENTRO', region: 'LIMA' };
}

/* ========================================================
   ISSE STUDIO: MOTOR VISUAL Y PAGINADOR (NIVEL DIRECTORIO)
   ======================================================== */
function renderizarISSE() {
    const container = document.getElementById('isse-report-container');
    const clientId = document.getElementById('isse-client-selector').value;
    const cliente = isseClientes.find(c => c.id === clientId);
    
    if (!cliente || !isseNoticias || isseNoticias.length === 0) {
        container.innerHTML = `<div class="bg-white p-10 rounded-lg shadow-xl text-center flex flex-col items-center"><i class="fa-solid fa-satellite-dish text-4xl text-gray-300 mb-4 block"></i><p class="text-gray-500 font-console">Esperando datos del OSINT Engine...<br>El radar está recolectando la inteligencia actual.</p></div>`;
        return;
    }

    // ==========================================
    // LOGO DEL CLIENTE 
    // ==========================================
    let logoUrl = cliente.logoBase64 ? cliente.logoBase64.trim() : '';
    let logoHtml = logoUrl ? `<img src="${logoUrl}" class="h-14 object-contain max-w-[180px] block" style="max-width: 180px; max-height: 56px;" alt="Logo Cliente">` : '';

    // ==========================================
    // MOTOR DE CO-BRANDING (Colores Dinámicos)
    // ==========================================
    let colorString = cliente.colores || '#0f172a,#0ea5e9'; 
    let colorArr = colorString.split(',');
    let cPrimary = colorArr[0] ? colorArr[0].trim() : '#0f172a';
    let cSecondary = colorArr[1] ? colorArr[1].trim() : cPrimary; 

    const hoyDate = new Date();
    const mesActualNum = hoyDate.getMonth(); 
    const anioActualNum = hoyDate.getFullYear();
    const diaActualNum = hoyDate.getDate();
    const diasEnMes = new Date(anioActualNum, mesActualNum + 1, 0).getDate();
    const fechaHoy = hoyDate.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
    const nombreMes = hoyDate.toLocaleDateString('es-PE', { month: 'long' });

    // LÓGICA EFEMÉRIDES
    const eventosMes = [];
    if (typeof isseEfemerides !== 'undefined' && isseEfemerides.length > 0) {
        isseEfemerides.forEach(e => {
            const parts = e.fechaCalculada.split('/');
            if (parts.length === 3) {
                if (parseInt(parts[1], 10) - 1 === mesActualNum && parseInt(parts[2], 10) === anioActualNum) {
                    eventosMes.push({ ...e, dia: parseInt(parts[0], 10) });
                }
            }
        });
    }
    const eventosHoy = eventosMes.filter(e => e.dia === diaActualNum);
    const eventosResto = eventosMes.filter(e => e.dia !== diaActualNum);

    let diasHtml = '';
    for(let d = 1; d <= diasEnMes; d++) {
        let hasEvent = eventosMes.some(e => e.dia === d);
        let isToday = d === diaActualNum;
        
        let bgStyle = "";
        let textClass = "text-slate-400";
        let extraClass = "";

        if(isToday) {
            bgStyle = `background-color: ${cSecondary};`; 
            textClass = "text-white font-bold";
            extraClass = "shadow-md scale-110 z-10 rounded";
        } else if(hasEvent) {
            bgStyle = `background-color: ${cPrimary}; opacity: 0.8;`;
            textClass = "text-white font-bold";
            extraClass = "rounded shadow-sm";
        }

        diasHtml += `<div class="flex-1 h-8 flex items-center justify-center transition-all ${textClass} ${extraClass}" style="${bgStyle}"><span class="font-console text-[9px]">${d}</span></div>`;
    }

    // BLOQUE HOY
    let hoyHtml = '';
    if(eventosHoy.length > 0) {
        
        // Mapeamos TODOS los eventos de hoy y los unimos dinámicamente
        let listaEventosHoy = eventosHoy.map(e => `
            <div class="mb-2 pb-2 border-b border-white/20 last:border-0 last:pb-0 last:mb-0 relative z-10">
                <h4 class="text-[15px] font-bold font-serif mb-1 text-white leading-tight" style="font-family: 'Playfair Display', serif;">${e.titulo}</h4>
                <p class="text-[9.5px] text-slate-200 leading-relaxed line-clamp-2">${e.motivo}</p>
            </div>
        `).join('');

        hoyHtml = `
        <div class="text-white p-3.5 rounded-lg border-l-4 shadow-xl mb-4 relative overflow-hidden shrink-0" 
             style="background-color: ${cPrimary}; border-color: ${cSecondary};">
            <div class="absolute -right-4 -top-8 text-[90px] text-white/5 font-serif"><i class="fa-solid fa-calendar-day"></i></div>
            <div class="flex justify-between items-start gap-4 mb-3 relative z-10">
                <span class="text-[9px] font-console tracking-widest uppercase mt-0.5" style="color: ${cSecondary};">Marcador del Día</span>
                <span class="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300 font-console border border-white/20 shrink-0">${String(diaActualNum).padStart(2,'0')}/${String(mesActualNum+1).padStart(2,'0')}</span>
            </div>
            ${listaEventosHoy}
        </div>`;
    } else {
        hoyHtml = `
        <div class="bg-slate-50 text-slate-500 p-3.5 rounded-lg border-l-4 mb-4 flex items-center justify-between gap-4 shadow-sm shrink-0" 
             style="border-color: ${cPrimary};">
            <div class="flex-1">
                <span class="text-[9px] font-console tracking-widest uppercase block mb-1" style="color: ${cSecondary};">Marcador del Día</span>
                <span class="text-[11px] font-bold text-slate-700 leading-tight block">Sin eventos que conmemorar hoy</span>
            </div>
            <span class="text-[10px] bg-white px-2 py-1 border border-slate-200 rounded text-slate-400 font-console shrink-0">${String(diaActualNum).padStart(2,'0')}/${String(mesActualNum+1).padStart(2,'0')}</span>
        </div>`;
    }

    let restoHtml = eventosResto.map(e => {
        // Cortamos el año para ahorrar espacio visual (Ej: 12/04/2026 -> 12/04)
        let fechaCorta = e.fechaCalculada.substring(0, 5); 
        return `
        <div class="bg-white border border-slate-200 p-2 pl-2.5 rounded-md shadow-sm relative flex flex-col justify-center min-h-[42px]">
            <div class="absolute top-0 left-0 w-1 h-full" style="background-color: ${cPrimary};"></div>
            <div class="text-[7.5px] font-bold font-console mb-1 w-fit px-1.5 py-[1px] rounded-sm" 
                 style="background-color: ${cSecondary}26; color: ${cSecondary};">
                ${fechaCorta}
            </div>
            <h5 class="text-[9.5px] font-bold text-slate-800 leading-tight font-serif line-clamp-2" style="font-family: 'Playfair Display', serif;">${e.titulo}</h5>
        </div>`;
    }).join('');

    // 3. EXTRACCIÓN DE DATOS PARA MACROZONAS
    const ordenZonas = ['COSTA NORTE', 'COSTA CENTRO', 'COSTA SUR', 'SIERRA NORTE', 'SIERRA CENTRO', 'SIERRA SUR', 'SELVA NORTE', 'SELVA CENTRO', 'SELVA SUR'];
    
    // ⚡ Mantenemos la llave interna como 'mgp' para no afectar el HTML
    let macrozonas = {
        'COSTA NORTE': { deps: 'Tumbes, Piura, Lambayeque, La Libertad', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'COSTA CENTRO': { deps: 'Áncash, Lima, Callao, Ica', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'COSTA SUR': { deps: 'Arequipa, Moquegua, Tacna', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'SIERRA NORTE': { deps: 'Cajamarca', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'SIERRA CENTRO': { deps: 'Huánuco, Pasco, Junín, Huancavelica, Ayacucho', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'SIERRA SUR': { deps: 'Apurímac, Cusco, Puno', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'SELVA NORTE': { deps: 'Amazonas, Loreto, San Martín', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'SELVA CENTRO': { deps: 'Ucayali', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } },
        'SELVA SUR': { deps: 'Madre de Dios', sutran: { c: 0, s: 1 }, igp: { c: 0, s: 1 }, mgp: { c: 0, s: 1 }, cgbvp: { c: 0, s: 1 } }
    };

    let dataSutran = {}, dataCgbvp = {}, dataMgp = {}, dataIgp = {};
    ordenZonas.forEach(z => { dataSutran[z] = []; dataCgbvp[z] = []; dataMgp[z] = []; dataIgp[z] = []; });

    let tSutran = 0, tIgp = 0, tMgp = 0, tCgbvp = 0;

    // SUTRAN (nuevos campos)
if (typeof datosGlobales !== 'undefined' && datosGlobales.sutran) {
    datosGlobales.sutran.forEach(r => {
        let est = String(r.estado).toUpperCase();
        if (est.includes('NORMAL')) return;
        let isRed = est.includes('INTERRUMPIDO');
        // Las coordenadas ahora vienen como latitud y longitud
        let lat = r.latitud != null ? parseFloat(r.latitud) : null;
        let lng = r.longitud != null ? parseFloat(r.longitud) : null;
        let ubicacion = clasificarUbicacion(r.ubigeo + ' ' + r.ubicación, lat, lng);

        macrozonas[ubicacion.zona].sutran.c++;
        macrozonas[ubicacion.zona].sutran.s = Math.max(macrozonas[ubicacion.zona].sutran.s, isRed ? 3 : 2);
        dataSutran[ubicacion.zona].push({...r, colorClass: isRed ? 'red' : 'amber', regionExt: ubicacion.region});
        tSutran++;
    });
}

    // IGP
    let ultimoSismoObj = null;
    if (typeof datosGlobales !== 'undefined' && datosGlobales.igp && datosGlobales.igp.length > 0) {
        let ultimos20 = datosGlobales.igp.slice(0, 20);
        ultimoSismoObj = ultimos20[0]; 
        ultimos20.forEach(r => {
            let mag = parseFloat(r['Magnitud']);
            let isRed = mag >= 6.0; let isAmber = mag >= 4.5 && mag < 6.0;
            let color = isRed ? 'red' : (isAmber ? 'amber' : 'green');
            let ubicacion = clasificarUbicacion(r['Referencia'], r['Latitud'], r['Longitud']);
            macrozonas[ubicacion.zona].igp.c++;
            macrozonas[ubicacion.zona].igp.s = Math.max(macrozonas[ubicacion.zona].igp.s, isRed ? 3 : (isAmber ? 2 : 1));
            dataIgp[ubicacion.zona].push({...r, colorClass: color, regionExt: ubicacion.region});
            tIgp++;
        });
    }

    // MGP (PUERTOS - EXTRAÍDO DE DICAPI PERO GUARDADO EN MGP)
    if (typeof datosGlobales !== 'undefined' && datosGlobales.dicapi) {
        datosGlobales.dicapi.forEach(row => {
            let estadoTxt = String(row['ESTADO LOGÍSTICO']).toUpperCase();
            let isRed = estadoTxt.includes('CIERRE TOTAL');
            let isAmber = estadoTxt.includes('CIERRE PARCIAL');
            let color = isRed ? 'red' : (isAmber ? 'amber' : 'green');
            
            let p = {
                capitania: row['CAPITANÍA'] || "DESCONOCIDA",
                nombre: row['NOMBRE DEL PUERTO'] || "SIN NOMBRE",
                estado: isRed ? 'ROJO' : (isAmber ? 'AMBAR' : 'VERDE'),
                fecha: row['FECHA REPORTE'] || "-",
                lat: row['LATITUD'],
                lng: row['LONGITUD']
            };

            let ubicacion = clasificarUbicacion(p.capitania, p.lat, p.lng);
            
            if (!isRed && !isAmber) { 
                dataMgp[ubicacion.zona].push({...p, colorClass: color, regionExt: ubicacion.region}); 
                return; 
            }
            macrozonas[ubicacion.zona].mgp.c++; 
            macrozonas[ubicacion.zona].mgp.s = Math.max(macrozonas[ubicacion.zona].mgp.s, isRed ? 3 : 2);
            dataMgp[ubicacion.zona].push({...p, colorClass: color, regionExt: ubicacion.region});
            tMgp++;
        });
    }

    // CGBVP
    if (typeof datosGlobales !== 'undefined' && datosGlobales.bomberos) {
        datosGlobales.bomberos.forEach(r => {
            if (!String(r['Estado']).toUpperCase().includes('ATENDIENDO')) return;
            let tipo = String(r['Tipo de Emergencia']).toUpperCase();
            let isRed = (tipo.includes('INCENDIO') || tipo.includes('ACC') || tipo.includes('MAT'));
            let ubicacion = clasificarUbicacion(r['Direccion'], r['Latitud'], r['Longitud']);
            
            macrozonas[ubicacion.zona].cgbvp.c++;
            macrozonas[ubicacion.zona].cgbvp.s = Math.max(macrozonas[ubicacion.zona].cgbvp.s, isRed ? 3 : 2);
            dataCgbvp[ubicacion.zona].push({...r, colorClass: isRed ? 'red' : 'amber', regionExt: ubicacion.region});
            tCgbvp++;
        });
    }

    const getColor = (s) => s === 3 ? 'text-red-500 bg-red-500/10 border-red-500/30' : (s === 2 ? 'text-amber-500 bg-amber-500/10 border-amber-500/30' : 'text-gray-400 bg-gray-100 border-gray-200');

    // 🟢 INMUNIZACIÓN DE TARJETAS (CSS PURO, Bypasseando Tailwind)
    const renderizarTarjetaMz = (zonaName, coordStyles) => {
        let mz = macrozonas[zonaName];
        if (!mz) return ''; 
        
        const getCol = (s) => {
            if (s === 3) return { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' }; 
            if (s === 2) return { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)' }; 
            return { text: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb' }; 
        };

        // ⚡ FIX: Leemos estrictamente de mz.mgp.s
        let ig = getCol(mz.igp.s), su = getCol(mz.sutran.s), mg = getCol(mz.mgp.s), cg = getCol(mz.cgbvp.s);

        return `
        <div style="position: absolute; width: 205px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); padding: 12px; display: flex; flex-direction: column; overflow: hidden; ${coordStyles}; z-index: 50 !important;">
            <div style="position: absolute; left: 0; top: 0; width: 4px; height: 100%; background-color: #1e293b;"></div>
            <div style="margin-bottom: 12px; padding-left: 4px;">
                <h4 style="font-weight: 700; color: #1e293b; font-size: 12px; font-family: sans-serif; letter-spacing: 0.025em; text-transform: uppercase; line-height: 1.2; margin: 0;">${zonaName}</h4>
                <p style="font-size: 8px; color: #64748b; font-family: monospace; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; line-height: 1.4; margin-bottom: 0;">${mz.deps}</p>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding-left: 4px; margin-top: auto;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 0; border-radius: 4px; border: 1px solid ${ig.border}; background-color: ${ig.bg}; color: ${ig.text};">
                    <i class="fa-solid fa-hill-rockslide" style="font-size: 10px; margin-bottom: 4px;"></i>
                    <span style="font-size: 10px; font-weight: 700; font-family: monospace; line-height: 1;">${mz.igp.c}</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 0; border-radius: 4px; border: 1px solid ${su.border}; background-color: ${su.bg}; color: ${su.text};">
                    <i class="fa-solid fa-road-barrier" style="font-size: 10px; margin-bottom: 4px;"></i>
                    <span style="font-size: 10px; font-weight: 700; font-family: monospace; line-height: 1;">${mz.sutran.c}</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 0; border-radius: 4px; border: 1px solid ${mg.border}; background-color: ${mg.bg}; color: ${mg.text};">
                    <i class="fa-solid fa-anchor" style="font-size: 10px; margin-bottom: 4px;"></i>
                    <span style="font-size: 10px; font-weight: 700; font-family: monospace; line-height: 1;">${mz.mgp.c}</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 0; border-radius: 4px; border: 1px solid ${cg.border}; background-color: ${cg.bg}; color: ${cg.text};">
                    <i class="fa-solid fa-fire" style="font-size: 10px; margin-bottom: 4px;"></i>
                    <span style="font-size: 10px; font-weight: 700; font-family: monospace; line-height: 1;">${mz.cgbvp.c}</span>
                </div>
            </div>
        </div>`;
    }

    // ==========================================
    // MOTOR DE PAGINACIÓN AUTOMÁTICA
    // ==========================================
    let numPaginaGlobal = 5;

    const createPage = (title, content) => {
        let p = `
        <div class="isse-page w-[794px] h-[1123px] bg-white text-slate-900 relative overflow-hidden shadow-2xl shrink-0 p-12 flex flex-col border border-gray-200">
            <div class="mb-6 border-b-2 border-slate-900 pb-3 flex justify-between items-end shrink-0 relative z-20">
                <h2 class="text-[26px] font-bold text-slate-900 uppercase tracking-wide" style="font-family: 'Playfair Display', serif;">${title}</h2>
                <span class="text-[10px] font-console text-slate-400 tracking-widest">ISSE / PÁG. ${String(numPaginaGlobal).padStart(2, '0')}</span>
            </div>
            <div class="flex-1 overflow-hidden flex flex-col content-start">
                ${content}
            </div>
            <div class="mt-auto pt-4 border-t border-slate-300 flex justify-between items-center text-[9px] text-slate-500 font-console uppercase tracking-widest shrink-0 relative z-20">
                <span>DOCUMENTO CONFIDENCIAL</span>
                <span class="text-slate-700 font-bold">${cliente.nombre}</span>
            </div>
        </div>`;
        numPaginaGlobal++;
        return p;
    };

    const paginarFuente = (titulo, dataPorZona, renderFn, extraTopHtml = '') => {
        let paginas = '';
        let itemsActuales = 0;
        let limitItems = 20; 
        let bloquesHtml = '';
        
        if (extraTopHtml !== '') {
            bloquesHtml += extraTopHtml;
            itemsActuales += 3; 
        }

        let hasData = ordenZonas.some(zona => dataPorZona[zona] && dataPorZona[zona].length > 0);
        if (!hasData) {
            return createPage(titulo, `${extraTopHtml}<div class="col-span-2 text-center text-slate-400 font-console py-10 mt-10 border border-dashed border-slate-300 rounded">NO SE REGISTRAN ALERTAS ACTIVAS</div>`);
        }

        ordenZonas.forEach(zona => {
            let items = dataPorZona[zona];
            if (!items || items.length === 0) return;

            let zonaHeader = `<div class="w-full col-span-2 mt-3 mb-1.5 border-b border-slate-200 pb-0.5 flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full" style="background-color: ${cPrimary};"></div><h3 class="text-[11px] font-bold text-slate-800 uppercase tracking-widest">${zona}</h3></div>`;
            
            if (itemsActuales + 2 > limitItems) { 
                paginas += createPage(titulo, `<div class="grid grid-cols-2 gap-2 content-start">${bloquesHtml}</div>`);
                bloquesHtml = ''; itemsActuales = 0;
            }
            
            bloquesHtml += zonaHeader;
            itemsActuales += 1.5;

            items.forEach(item => {
                if (itemsActuales >= limitItems) {
                    paginas += createPage(titulo, `<div class="grid grid-cols-2 gap-2 content-start">${bloquesHtml}</div>`);
                    bloquesHtml = `<div class="w-full col-span-2 mt-3 mb-1.5 border-b border-slate-200 pb-0.5 flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full" style="background-color: ${cPrimary};"></div><h3 class="text-[11px] font-bold text-slate-800 uppercase tracking-widest">${zona} (CONT.)</h3></div>`;
                    itemsActuales = 1.5;
                }
                bloquesHtml += renderFn(item);
                itemsActuales += 1;
            });
        });

        if (itemsActuales > 0) {
            paginas += createPage(titulo, `<div class="grid grid-cols-2 gap-2 content-start">${bloquesHtml}</div>`);
        }
        return paginas;
    };

    // ==========================================
    // CONSTRUCCIÓN DEL DOCUMENTO MAESTRO
    // ==========================================
    let html = '';

    // PÁG 01: PORTADA PRINCIPAL (DISEÑO SÓLIDO GEOMÉTRICO)
    html += `
    <div class="isse-page w-[794px] h-[1123px] relative overflow-hidden shadow-2xl shrink-0" style="background-color: ${cPrimary};">
        
        <div class="absolute z-0" style="top: 15%; left: 43%; width: 280px; height: 60px; background-color: ${cSecondary}; border-radius: 100px;"></div>
        <div class="absolute z-0" style="top: 25%; left: 30%; width: 180px; height: 45px; background-color: ${cSecondary}; border-radius: 100px;"></div>
        
        <div class="absolute z-0" style="bottom: 15%; left: -60px; width: 180px; height: 180px; background-color: ${cSecondary}; border-radius: 50%;"></div>
        <div class="absolute z-0" style="bottom: 22%; right: -40px; width: 200px; height: 70px; background-color: ${cSecondary}; border-radius: 100px;"></div>
        
        <div class="absolute top-0 right-0 bg-white z-50 pt-8 pr-12 pb-10 pl-14 shadow-xl" style="border-bottom-left-radius: 110px;">
            ${logoHtml}
        </div>

        <div class="relative z-50 h-full flex flex-col p-16">
            
            <div class="flex justify-between items-start mt-2">
                <div class="font-console text-[10px] tracking-[0.4em] pl-3 border-l-2" style="border-color: ${cSecondary};">
                    <span class="text-white font-bold">ISSE REPORT // ${anioActualNum}</span>
                </div>
            </div>
            
            <div class="mt-auto mb-auto">
                <h1 class="text-[65px] font-bold leading-[1.05] mb-6 text-white" style="font-family: 'Playfair Display', serif;">
                    Informe<br>Situacional de<br>Seguridad y Entorno
                </h1>
                <div class="w-32 h-1.5 mb-8" style="background-color: ${cSecondary};"></div>
                <p class="text-xl text-white/90 font-medium max-w-lg leading-relaxed">
                    Inteligencia estratégica y análisis de riesgos de entorno para la toma de decisiones ejecutivas en el territorio nacional.
                </p>
            </div>
            
            <div class="flex justify-between items-end">
                <div>
                    <p class="text-[10px] font-bold tracking-widest uppercase opacity-60 mb-1 text-white">FECHA DE EMISIÓN</p>
                    <p class="text-xl font-serif text-white font-bold">${fechaHoy}</p>
                </div>
                <div class="text-right">
                    <p class="text-[10px] font-bold tracking-widest uppercase opacity-60 mb-1 text-white">SISTEMA ANALÍTICO</p>
                    <p class="text-lg font-console font-bold uppercase" style="color: ${cSecondary};">SAM_ENGINE</p>
                </div>
            </div>
            
        </div>
    </div>`;

    // PÁG 02: HOJA DE CONTRASTE
    html += `
    <div class="isse-page w-[794px] h-[1123px] bg-white relative overflow-hidden shadow-2xl shrink-0 p-16 flex flex-col justify-center">
        <h1 class="text-[65px] font-bold leading-[1.05] mb-6" style="font-family: 'Playfair Display', serif; color: ${cPrimary};">Informe<br>Situacional de<br>Seguridad y Entorno</h1>
        <div class="w-32 h-1.5 mb-14" style="background-color: ${cSecondary};"></div>
        
        <div class="flex flex-col gap-8 opacity-50" style="color: ${cSecondary};">
            <div class="flex items-center gap-6"><i class="fa-solid fa-newspaper text-[32px] w-10 text-center"></i><span class="text-xl font-bold font-console uppercase tracking-widest">Radar OSINT (Noticias)</span></div>
            <div class="flex items-center gap-6"><i class="fa-solid fa-road-barrier text-[32px] w-10 text-center"></i><span class="text-xl font-bold font-console uppercase tracking-widest">Estado de Carreteras</span></div>
            <div class="flex items-center gap-6"><i class="fa-solid fa-anchor text-[32px] w-10 text-center"></i><span class="text-xl font-bold font-console uppercase tracking-widest">Estado de Puertos</span></div>
            <div class="flex items-center gap-6"><i class="fa-solid fa-fire text-[32px] w-10 text-center"></i><span class="text-xl font-bold font-console uppercase tracking-widest">Alertas Bomberos 24H</span></div>
            <div class="flex items-center gap-6"><i class="fa-solid fa-hill-rockslide text-[32px] w-10 text-center"></i><span class="text-xl font-bold font-console uppercase tracking-widest">Últimos Sismos</span></div>
        </div>

        <div class="absolute bottom-16 left-16 text-left">
            <p class="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">POWERED BY</p>
            <p class="text-lg font-console" style="color: ${cSecondary};">SAM_ENGINE</p>
        </div>
    </div>`;

    // PÁG 03: ÍNDICE VENDEDOR (TOC)
    html += `
    <div class="isse-page w-[794px] h-[1123px] bg-slate-50 relative overflow-hidden shadow-2xl shrink-0 p-16 flex flex-col">
        <div class="mb-10 border-b-2 pb-4 flex justify-between items-end shrink-0 relative z-20" style="border-color: ${cPrimary};">
            <h2 class="text-[32px] font-bold uppercase tracking-wide" style="font-family: 'Playfair Display', serif; color: ${cPrimary};">Contenido Estratégico</h2>
            <span class="text-[10px] font-console text-slate-400 tracking-widest">ISSE / PÁG. 03</span>
        </div>
        
        <div class="flex-1 flex flex-col justify-center px-4 gap-5">
            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-brain"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">1. Inteligencia y Entorno</span>
            </div>

            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-newspaper"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">2. Radar OSINT (Noticias)</span>
            </div>
            
            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-map-location-dot"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">3. Mapa de Alertas por Macrozonas</span>
            </div>

            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-road-barrier"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">4. Estado de Carreteras (SUTRAN)</span>
            </div>

            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-anchor"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">5. Estado de Puertos (MGP)</span>
            </div>

            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-fire"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">6. Alertas de Bomberos 24H (CGBVP)</span>
            </div>

            <div class="flex items-center gap-5 p-4 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden transition-all">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white shadow-md shrink-0" style="background-color: ${cSecondary};"><i class="fa-solid fa-hill-rockslide"></i></div>
                <span class="text-lg font-bold text-slate-800 tracking-wide uppercase">7. Últimos Sismos (IGP)</span>
            </div>

            
        </div>
        
        <div class="mt-auto pt-4 border-t border-slate-300 flex justify-between items-center text-[9px] text-slate-500 font-console uppercase tracking-widest shrink-0">
            <span>DOCUMENTO CONFIDENCIAL</span>
            <span class="text-slate-700 font-bold">${cliente.nombre}</span>
        </div>
    </div>`;

    // PÁG 04: INTELIGENCIA Y ENTORNO + EFEMÉRIDES
    html += `
    <div class="isse-page w-[794px] h-[1123px] bg-white text-slate-900 relative overflow-hidden shadow-2xl shrink-0 p-12 flex flex-col border border-gray-200">
        
        <div class="h-[48%] flex flex-col shrink-0">
            <div class="mb-6 border-b-2 border-slate-900 pb-2 flex justify-between items-end">
                <h2 class="text-[26px] font-bold text-slate-900 uppercase tracking-wide" style="font-family: 'Playfair Display', serif;">1. Inteligencia y Entorno</h2>
                <span class="text-[10px] font-console text-slate-400 tracking-widest">ISSE / PÁG. 04</span>
            </div>

            <div class="flex items-start gap-5 p-5 bg-slate-50 rounded-2xl border border-slate-200 mb-0 relative overflow-hidden">
                <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${cPrimary};"></div>
                <div class="w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0" style="background-color: ${cPrimary};">
                    <i class="fa-solid fa-microchip text-2xl"></i>
                </div>
                <div>
                    <h3 class="text-sm font-bold uppercase mb-1.5 tracking-wider" style="color: ${cPrimary};">Motor Analítico ISSE</h3>
                    <p class="text-[12.5px] text-slate-700 leading-relaxed text-justify">
                        Nuestra arquitectura de obtención de datos integra algoritmos de Inteligencia de Fuentes Abiertas (OSINT) y conexiones API directas con entidades gubernamentales. El sistema extrae, filtra y clasifica táctica y geográficamente miles de flujos de datos en tiempo real, transformando el ruido informativo en inteligencia estratégica y anticipativa para el resguardo de activos y operaciones corporativas.
                    </p>
                </div>
            </div>

            <div class="flex-1 flex flex-col justify-center bg-white border border-slate-100 rounded-2xl p-4 mb-6 shadow-sm">
                <div class="text-center mb-4">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Dataflow — ISSE Intelligence</span>
                </div>
                
                <div class="flex items-center justify-around gap-2">
                    <div class="grid grid-cols-2 gap-2">
                        <div class="w-24 p-2 rounded-lg border border-slate-100 bg-slate-50 flex flex-col items-center">
                            <i class="fa-solid fa-road-barrier text-orange-500 mb-1"></i>
                            <span class="text-[9px] font-bold text-slate-800">SUTRAN</span>
                        </div>
                        <div class="w-24 p-2 rounded-lg border border-slate-100 bg-slate-50 flex flex-col items-center">
                            <i class="fa-solid fa-anchor text-blue-500 mb-1"></i>
                            <span class="text-[9px] font-bold text-slate-800">MGP</span>
                        </div>
                        <div class="w-24 p-2 rounded-lg border border-slate-100 bg-slate-50 flex flex-col items-center">
                            <i class="fa-solid fa-fire text-red-500 mb-1"></i>
                            <span class="text-[9px] font-bold text-slate-800">CGBVP</span>
                        </div>
                        <div class="w-24 p-2 rounded-lg border border-slate-100 bg-slate-50 flex flex-col items-center">
                            <i class="fa-solid fa-hill-rockslide text-amber-500 mb-1"></i>
                            <span class="text-[9px] font-bold text-slate-800">IGP</span>
                        </div>
                    </div>

                    <div class="flex flex-col items-center opacity-30">
                        <i class="fa-solid fa-chevron-right text-xl mb-[-10px]"></i>
                        <i class="fa-solid fa-chevron-right text-xl"></i>
                    </div>

                    <div class="flex flex-col items-center justify-center p-6 rounded-full border-2 border-dashed border-slate-300 relative">
                        <div class="w-20 h-20 rounded-full flex flex-col items-center justify-center text-white shadow-2xl z-10" style="background-color: ${cPrimary};">
                            <i class="fa-solid fa-brain text-3xl"></i>
                            <span class="text-[9px] font-bold mt-1">ISSE Report</span>
                        </div>
                        <div class="absolute inset-0 rounded-full animate-ping opacity-10" style="background-color: ${cPrimary};"></div>
                    </div>

                    <div class="flex flex-col items-center opacity-30">
                        <i class="fa-solid fa-chevron-left text-xl mb-[-10px]"></i>
                        <i class="fa-solid fa-chevron-left text-xl"></i>
                    </div>

                    <div class="w-32 p-4 rounded-xl border border-purple-100 bg-purple-50 flex flex-col items-center shadow-sm">
                        <i class="fa-solid fa-newspaper text-purple-500 text-xl mb-2"></i>
                        <span class="text-[10px] font-bold text-purple-900 text-center uppercase">Radar OSINT Analysis</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-3">
                <div class="p-3 bg-white border-b-2 border-slate-100 rounded-lg flex items-center gap-3" style="border-bottom-color: #ef4444;">
                    <i class="fa-solid fa-shield-halved text-red-500 text-sm"></i>
                    <div class="leading-tight"><strong class="text-[9px] text-slate-800 uppercase block">Seguridad</strong><span class="text-[8px] text-slate-400">Terrorismo / FF.AA.</span></div>
                </div>
                <div class="p-3 bg-white border-b-2 border-slate-100 rounded-lg flex items-center gap-3" style="border-bottom-color: #f97316;">
                    <i class="fa-solid fa-users-rays text-orange-500 text-sm"></i>
                    <div class="leading-tight"><strong class="text-[9px] text-slate-800 uppercase block">Social y Actualidad</strong><span class="text-[8px] text-slate-400">Protestas / Bloqueos</span></div>
                </div>
                <div class="p-3 bg-white border-b-2 border-slate-100 rounded-lg flex items-center gap-3" style="border-bottom-color: #1e293b;">
                    <i class="fa-solid fa-handcuffs text-slate-800 text-sm"></i>
                    <div class="leading-tight"><strong class="text-[9px] text-slate-800 uppercase block">Policial</strong><span class="text-[8px] text-slate-400">Asaltos / Sicariato</span></div>
                </div>
                <div class="p-3 bg-white border-b-2 border-slate-100 rounded-lg flex items-center gap-3" style="border-bottom-color: #2563eb;">
                    <i class="fa-solid fa-scale-balanced text-blue-600 text-sm"></i>
                    <div class="leading-tight"><strong class="text-[9px] text-slate-800 uppercase block">Política / Economía</strong><span class="text-[8px] text-slate-400">Leyes / Estado</span></div>
                </div>
            </div>
        </div>

        <div class="w-full h-px bg-slate-200 my-8"></div>

        <div class="h-[48%] flex flex-col bg-white">
            <div class="flex justify-between items-end mb-4 border-b border-slate-200 pb-2 shrink-0">
                <h3 class="text-xl font-bold text-slate-900" style="font-family: 'Playfair Display', serif;">Calendario de Efemérides</h3>
                <span class="text-[10px] font-console text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded border border-slate-200">${nombreMes} ${anioActualNum}</span>
            </div>

            <div class="flex w-full gap-[2px] mb-5 bg-slate-100 p-1 rounded border border-slate-200 shrink-0">
                ${diasHtml}
            </div>

            <div class="flex-1 overflow-hidden flex flex-col">
                ${hoyHtml}
                <div class="grid grid-cols-3 gap-2 auto-rows-max overflow-y-hidden">
                    ${restoHtml}
                </div>
            </div>
        </div>

        <div class="mt-auto pt-4 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 font-console uppercase tracking-widest shrink-0">
            <span>DOCUMENTO CONFIDENCIAL</span>
            <span class="text-slate-600 font-bold">${cliente.nombre}</span>
        </div>
    </div>`;

    // ==========================================
    // PÁGINAS OSINT (NACIONAL, REGIONAL, GLOBAL) - COLUMNAS EN CASCADA Y CATEGORÍAS
    // ==========================================
    
    // 1. Diccionarios de Traducción y Orden Estricto
    const TITULOS_MADRE = { "PERÚ": "NACIONAL", "REGIÓN": "REGIONAL", "GLOBAL": "GLOBAL" };
    const ORDEN_AMBITO = ["PERÚ", "REGIÓN", "GLOBAL"];
    const ORDEN_CATEGORIA = {
      "PERÚ": ["Política", "Crimen organizado y delincuencia", "Economía Nacional", "Judiciales", "Social"],
      "REGIÓN": ["Seguridad y crimen", "Comercio exterior", "Sucesos en la región"],
      "GLOBAL": ["Geopolitica y conflictos", "Economía Internacional", "Sucesos importantes", "Ciencia y tecnología"]
    };

    // 2. Ordenamiento Militar del Array de Noticias
    let noticiasOrdenadas = [...isseNoticias].sort((a, b) => {
      let indexAmbitoA = ORDEN_AMBITO.indexOf(String(a.ambito).trim());
      let indexAmbitoB = ORDEN_AMBITO.indexOf(String(b.ambito).trim());
      if (indexAmbitoA !== indexAmbitoB) return indexAmbitoA - indexAmbitoB;
      
      let indexCatA = ORDEN_CATEGORIA[String(a.ambito).trim()].indexOf(String(a.categoria).trim());
      let indexCatB = ORDEN_CATEGORIA[String(b.ambito).trim()].indexOf(String(b.categoria).trim());
      return indexCatA - indexCatB;
    });

    // 3. Ensamblaje por Ámbito
    ORDEN_AMBITO.forEach(amb => {
        const notasAmbito = noticiasOrdenadas.filter(n => String(n.ambito).trim() === amb);
        if (notasAmbito.length === 0) return;
        
        let tituloFrontal = TITULOS_MADRE[amb] || amb;
        // CONTENEDOR MÁGICO: 2 columnas, llenado vertical estricto
        let bloqueNotasHtml = `<div style="column-count: 2; column-fill: auto; height: 830px; column-gap: 20px;">`;
        let contadorNotasPagina = 0;

        // Extraemos las categorías presentes en este ámbito y las ordenamos
        let catsPresentes = [...new Set(notasAmbito.map(n => String(n.categoria).trim()))];
        catsPresentes.sort((a, b) => ORDEN_CATEGORIA[amb].indexOf(a) - ORDEN_CATEGORIA[amb].indexOf(b));

        catsPresentes.forEach(cat => {
            let notasCat = notasAmbito.filter(n => String(n.categoria).trim() === cat);
            if (notasCat.length === 0) return;

            // ELIMINAMOS la inyección del título aquí afuera para meterla dentro del ciclo

            notasCat.forEach((n, idx) => {
                let tituloCategoriaHtml = ''; // Variable dinámica para el título

                // Si es la primera nota de la categoría, armamos el título principal
                if (idx === 0) {
                    tituloCategoriaHtml = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${cPrimary};"></div>
                        <h3 style="font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; margin: 0;">${cat}</h3>
                    </div>`;
                }

                if (contadorNotasPagina >= 5) {
                    bloqueNotasHtml += `</div>`; // Cerramos el contenedor
                    html += createPage(`2. RADAR OSINT: ${tituloFrontal}`, bloqueNotasHtml);
                    bloqueNotasHtml = `<div style="column-count: 2; column-fill: auto; height: 830px; column-gap: 20px;">`;
                    contadorNotasPagina = 0;
                    
                    // Si saltamos de página y la categoría sigue, armamos el título con (CONT.)
                    if (idx > 0) {
                        tituloCategoriaHtml = `
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${cPrimary};"></div>
                            <h3 style="font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; margin: 0;">${cat} (CONT.)</h3>
                        </div>`;
                    }
                }

                // Tratamiento de Fecha 
                let fechaDisplay = n.fecha; 
                try {
                    if (fechaDisplay.includes('/')) {
                        let partesHora = fechaDisplay.split(' '); 
                        let partesFecha = partesHora[0].split('/'); 
                        if (partesFecha.length >= 2) {
                            let dia = parseInt(partesFecha[0], 10);
                            let mes = parseInt(partesFecha[1], 10);
                            let anio = partesFecha[2] ? partesFecha[2] : anioActualNum;
                            let hora = partesHora[1] ? ` - ${partesHora[1]}` : '';
                            const nomMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
                            fechaDisplay = `${dia} ${nomMeses[mes-1]} ${anio}${hora}`;
                        }
                    }
                } catch(e) {}

                let textoCrudo = n.desarrollo || n.descripcion || 'Sin análisis disponible.';
                let parrafosHtml = textoCrudo.split('\n')
                                   .filter(p => p.trim() !== '')
                                   .map(p => `<p style="margin-bottom: 6px; margin-top: 0;" class="last:mb-0">${p.trim()}</p>`)
                                   .join('');

                // ESTRUCTURA ATÓMICA: Envolvemos el Título (si existe) y la Tarjeta en un solo DIV inquebrantable
                bloqueNotasHtml += `
                <div style="break-inside: avoid; page-break-inside: avoid; width: 100%; margin-bottom: 16px; box-sizing: border-box;">
                    ${tituloCategoriaHtml}
                    <div class="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm flex flex-col">
                        <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; margin-bottom: 8px;">
                            <span style="font-size: 8px; white-space: nowrap; color: ${cSecondary};" class="font-console font-bold">
                                <i class="fa-regular fa-clock"></i> ${fechaDisplay}
                            </span>
                        </div>
                        
                        <h4 style="font-size: 11.5px; font-family: 'Playfair Display', serif; line-height: 1.3; margin-top: 0; margin-bottom: 8px;" class="font-bold text-slate-900 uppercase">
                            <a href="${n.link || n.hash}" target="_blank" style="text-decoration:none; color:inherit;">${n.titulo}</a>
                        </h4>
                        
                        <div style="font-size: 10.5px; line-height: 1.5;" class="text-slate-700 text-justify flex-1">
                            ${parrafosHtml}
                        </div>
                    </div>
                </div>`;
                
                contadorNotasPagina++;
            });
        });

        bloqueNotasHtml += `</div>`; // Cerramos el contenedor flex final

        if (contadorNotasPagina > 0) {
            html += createPage(`2. RADAR OSINT: ${tituloFrontal}`, bloqueNotasHtml);
        }
    });
    
    // ==========================================
    // PÁG 05: MAPA DE MACROZONAS (BLINDADO CON PÍXELES FIJOS)
    // ==========================================
    html += `
    <div class="isse-page w-[794px] h-[1123px] bg-white text-slate-900 relative isolate overflow-hidden shadow-2xl shrink-0 p-12 flex flex-col border border-gray-200">
        <div class="absolute inset-0 opacity-[0.20]" style="background-image: url('https://i.postimg.cc/sXvbSYmK/MAPA-PERU.jpg'); background-size: contain; background-repeat: no-repeat; background-position: center; z-index: -1;"></div>
        
        <div class="mb-5 border-b-2 border-slate-900 pb-3 flex justify-between items-end shrink-0 relative z-30">
            <h2 class="text-[26px] font-bold text-slate-900 uppercase tracking-wide" style="font-family: 'Playfair Display', serif;">3. Mapa de Alertas por Macrozonas</h2>
            <span class="text-[10px] font-console text-slate-400 tracking-widest">ISSE / PÁG. ${String(numPaginaGlobal).padStart(2, '0')}</span>
        </div>
        
        <div class="mb-4 pb-4 grid grid-cols-4 gap-4 relative z-30 shrink-0 h-[80px]">
            <div class="bg-white/95 backdrop-blur-sm p-2.5 rounded border border-slate-200 flex items-center justify-between shadow-sm">
                <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-200"><i class="fa-solid fa-hill-rockslide"></i></div><div class="flex flex-col"><span class="text-[8px] text-slate-400 font-console uppercase tracking-widest">IGP NACIONAL</span><span class="text-[10px] font-bold text-slate-800">Sismos Activos</span></div></div><span class="text-xl font-bold font-console text-slate-900">${tIgp}</span>
            </div>
            <div class="bg-white/95 backdrop-blur-sm p-2.5 rounded border border-slate-200 flex items-center justify-between shadow-sm">
                <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-200"><i class="fa-solid fa-road-barrier"></i></div><div class="flex flex-col"><span class="text-[8px] text-slate-400 font-console uppercase tracking-widest">SUTRAN NACION.</span><span class="text-[10px] font-bold text-slate-800">Vías Afectadas</span></div></div><span class="text-xl font-bold font-console text-slate-900">${tSutran}</span>
            </div>
            <div class="bg-white/95 backdrop-blur-sm p-2.5 rounded border border-slate-200 flex items-center justify-between shadow-sm">
                <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-200"><i class="fa-solid fa-anchor"></i></div><div class="flex flex-col"><span class="text-[8px] text-slate-400 font-console uppercase tracking-widest">MGP NACIONAL</span><span class="text-[10px] font-bold text-slate-800">Puertos Cerrados</span></div></div><span class="text-xl font-bold font-console text-slate-900">${tMgp}</span>
            </div>
            <div class="bg-white/95 backdrop-blur-sm p-2.5 rounded border border-slate-200 flex items-center justify-between shadow-sm">
                <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center border border-red-200"><i class="fa-solid fa-fire"></i></div><div class="flex flex-col"><span class="text-[8px] text-slate-400 font-console uppercase tracking-widest">CGBVP NACION.</span><span class="text-[10px] font-bold text-slate-800">Emerg. Activas</span></div></div><span class="text-xl font-bold font-console text-slate-900">${tCgbvp}</span>
            </div>
        </div>

        <div class="w-full relative z-50 mt-2 mb-6 block" style="height: 680px; min-height: 680px;">
            ${renderizarTarjetaMz('COSTA NORTE', 'top: 20px; left: 0px;')}
            ${renderizarTarjetaMz('SIERRA NORTE', 'top: 80px; left: 245px;')}
            ${renderizarTarjetaMz('SELVA NORTE', 'top: 20px; left: 490px;')}
            
            ${renderizarTarjetaMz('COSTA CENTRO', 'top: 300px; left: 0px;')}
            ${renderizarTarjetaMz('SIERRA CENTRO', 'top: 260px; left: 245px;')}
            ${renderizarTarjetaMz('SELVA CENTRO', 'top: 180px; left: 490px;')}
            
            ${renderizarTarjetaMz('COSTA SUR', 'bottom: 80px; left: 150px;')}
            ${renderizarTarjetaMz('SIERRA SUR', 'bottom: 150px; left: 380px;')}
            ${renderizarTarjetaMz('SELVA SUR', 'bottom: 280px; left: 490px;')}
        </div>
        
        <div class="mt-auto pt-4 border-t border-slate-300 flex justify-between items-center text-[9px] text-slate-500 font-console uppercase tracking-widest shrink-0 relative z-30">
            <span>DOCUMENTO CONFIDENCIAL</span><span class="text-slate-700 font-bold">${cliente.nombre}</span>
        </div>
    </div>`;
    numPaginaGlobal++;

    // ==========================================
    // PÁGINAS DE ANEXOS POR FUENTE
    // ==========================================
    
    const tplSutran = (i) => `
    <div class="bg-white border border-slate-200 border-l-4 border-l-${i.colorClass}-500 px-3 py-2 rounded shadow-sm flex flex-col justify-between">
        <div class="flex justify-between items-start mb-1.5">
            <span class="text-[8.5px] font-bold uppercase text-${i.colorClass}-500 bg-${i.colorClass}-50 px-1.5 py-0.5 rounded">${i.estado || 'NORMAL'}</span>
            <span class="text-[8px] font-console text-slate-400">${formatearFechaPeru(i.fechaHora_evento)}</span>
        </div>
        <h4 class="text-[10.5px] font-bold text-slate-800 leading-tight mb-1 uppercase">${i.ubicación} <span class="text-slate-500 font-bold">- ${i.regionExt}</span></h4>
        <p class="text-[9.5px] text-slate-600 leading-tight line-clamp-2">${i.evento || i.motivo || ''}</p>
    </div>`;
    html += paginarFuente("4. Estado de Carreteras (SUTRAN)", dataSutran, tplSutran);

    // =========================================================================
    // SECCIÓN 4: ESTADO DE PUERTOS (MGP) - PAGINADOR MATEMÁTICO 2 COLUMNAS
    // =========================================================================
    /*const acortarFecha = (fechaStr) => {
        try {
            let p = fechaStr.split(' '); let f = p[0].split('/'); let h = p[1].split(':');
            return `${f[0]}/${f[1]} ${h[0]}:${h[1]}`;
        } catch(e) { return fechaStr; }
    };*/

    let paginasMgp = '';
    const MAX_COL_HEIGHT = 810; // Altura máxima en píxeles por columna

    let col1Html = '', col2Html = '';
    let col1Height = 0, col2Height = 0;
    let currentColumn = 1;

    const flushPageMgp = () => {
        if (col1Height === 0 && col2Height === 0) return;
        let layout = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
            <div style="width: 48.5%; display: flex; flex-direction: column;">${col1Html}</div>
            <div style="width: 48.5%; display: flex; flex-direction: column;">${col2Html}</div>
        </div>`;
        let tituloPagina = "5. Estado de Puertos (MGP)";
        paginasMgp += createPage(tituloPagina, layout);
        
        col1Html = ''; col2Html = '';
        col1Height = 0; col2Height = 0;
        currentColumn = 1;
    };

    ordenZonas.forEach(zona => {
        let puertosZona = dataMgp[zona];
        if (!puertosZona || puertosZona.length === 0) return;

        let capMap = {};
        puertosZona.forEach(p => {
            let cap = (p.capitania || "DESCONOCIDA").toUpperCase();
            if (!capMap[cap]) capMap[cap] = [];
            capMap[cap].push(p);
        });

        Object.keys(capMap).forEach(cap => {
            capMap[cap].sort((a, b) => {
                let peso = { 'ROJO': 3, 'AMBAR': 2, 'VERDE': 1 };
                return peso[b.estado] - peso[a.estado];
            });
        });

        let addedZoneHeader = false;
        const HEADER_ZONA_HEIGHT = 38; 
        const ROW_HEIGHT = 18;
        const BOX_HEADER_HEIGHT = 28;
        const MARGIN_BOTTOM = 14;

        Object.keys(capMap).sort().forEach(cap => {
            let puertos = capMap[cap];
            
            // Chunking: Si una capitanía tiene demasiados puertos, la partimos para no reventar la columna
            const MAX_ROWS_PER_BOX = Math.floor((MAX_COL_HEIGHT - BOX_HEADER_HEIGHT - HEADER_ZONA_HEIGHT) / ROW_HEIGHT);
            let chunks = [];
            for (let i = 0; i < puertos.length; i += MAX_ROWS_PER_BOX) {
                chunks.push(puertos.slice(i, i + MAX_ROWS_PER_BOX));
            }

            chunks.forEach((chunk, chunkIndex) => {
                let pesoCaja = BOX_HEADER_HEIGHT + (chunk.length * ROW_HEIGHT) + MARGIN_BOTTOM;

                // Lógica de Salto de Columna/Página
                if (currentColumn === 1 && (col1Height + pesoCaja > MAX_COL_HEIGHT) && col1Height > 0) {
                    currentColumn = 2; addedZoneHeader = false;
                } else if (currentColumn === 2 && (col2Height + pesoCaja > MAX_COL_HEIGHT) && col2Height > 0) {
                    flushPageMgp(); addedZoneHeader = false;
                }

                // Imprimir Título de Macrozona si es necesario en esta columna
                if (!addedZoneHeader) {
                    let tituloZona = (col1Height === 0 && col2Height === 0 && currentColumn === 1) ? zona : `${zona} (CONT.)`;
                    let zHeader = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; margin-bottom: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${cPrimary};"></div>
                        <h3 style="font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; margin: 0;">${tituloZona}</h3>
                    </div>`;
                    if (currentColumn === 1) { col1Html += zHeader; col1Height += HEADER_ZONA_HEIGHT; }
                    else { col2Html += zHeader; col2Height += HEADER_ZONA_HEIGHT; }
                    addedZoneHeader = true;
                }

                // Generar filas HTML
                let filasHtml = chunk.map(p => {
                    let col = p.estado === 'ROJO' ? '#ef4444' : (p.estado === 'AMBAR' ? '#f59e0b' : '#10b981');
                    return `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="width: 14px; padding: 4px 0 4px 6px; vertical-align: middle;">
                            <div style="width: 6px; height: 6px; border-radius: 50%; background-color: ${col};"></div>
                        </td>
                        <td style="padding: 4px 2px; vertical-align: middle;">
                            <div style="font-size: 9px; font-weight: 700; color: #334155; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px;" title="${p.nombre}">
                                ${p.nombre}
                            </div>
                        </td>
                        <td style="width: 55px; padding: 4px 6px 4px 0; font-size: 7px; font-family: monospace; color: #94a3b8; text-align: right; vertical-align: middle; white-space: nowrap;">
                            ${(formatearFechaPeru(p.fecha))}
                        </td>
                    </tr>`;
                }).join('');

                let capTitle = chunkIndex === 0 ? cap : `${cap} (CONT.)`;
                let capHtml = `
                <div style="margin-bottom: ${MARGIN_BOTTOM}px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.05); background-color: #ffffff; width: 100%;">
                    <div style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 5px 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 8.5px; font-weight: 800; color: ${cPrimary}; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fa-solid fa-anchor mr-1" style="color: #3b82f6;"></i> ${capTitle}
                        </span>
                        <span style="font-size: 7px; font-weight: 700; color: #64748b; background: #e2e8f0; padding: 1.5px 5px; border-radius: 3px;">
                            ${chunk.length} TERM.
                        </span>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; table-layout: fixed;"><tbody>${filasHtml}</tbody></table>
                </div>`;

                // Añadir a la columna correspondiente
                if (currentColumn === 1) { col1Html += capHtml; col1Height += pesoCaja; }
                else { col2Html += capHtml; col2Height += pesoCaja; }
            });
        });
    });

    flushPageMgp(); // Vacía los últimos elementos que quedaron en memoria
    html += paginasMgp;
    // =========================================================================

    const tplCgbvp = (i) => `
        <div class="bg-white border border-slate-200 border-l-4 border-l-${i.colorClass}-500 px-3 py-2 rounded shadow-sm flex flex-col justify-between">
            <div class="flex justify-between items-start mb-1.5">
                <span class="text-[8.5px] font-bold uppercase text-${i.colorClass}-500 bg-${i.colorClass}-50 px-1.5 py-0.5 rounded">${String(i['Tipo de Emergencia']).split('/')[0].trim()}</span>
                <span class="text-[8px] font-console text-slate-400">${formatearFechaPeru(i['Fecha y Hora'])}</span>
            </div>
            <h4 class="text-[10.5px] font-bold text-slate-800 leading-tight mb-1 uppercase line-clamp-2">${i['Direccion']} <span class="text-slate-500 font-bold">- ${i.regionExt}</span></h4>
            <p class="text-[8.5px] text-slate-500 font-console uppercase mt-auto">Parte N° ${i['Nro Parte']}</p>
        </div>`;
    html += paginarFuente("6. Alertas de Bomberos 24H (CGBVP)", dataCgbvp, tplCgbvp);

    let headerSismo = '';
    if (ultimoSismoObj) {
        let mag = parseFloat(ultimoSismoObj['Magnitud']);
        let colF = mag >= 6.0 ? 'red' : (mag >= 4.5 ? 'amber' : 'green');
        let statusColor = colF === 'red' ? '#ef4444' : (colF === 'amber' ? '#f59e0b' : '#22c55e');

        headerSismo = `
        <div class="col-span-2 text-white p-5 rounded-lg border-l-4 shadow-xl mb-2 flex items-center gap-6 relative overflow-hidden" 
             style="background-color: ${cPrimary}; border-color: ${statusColor};">
            
            <i class="fa-solid fa-satellite-dish absolute -right-4 -top-4 text-[80px] text-white/10"></i>
            <div class="text-[45px] font-bold font-console text-white leading-none drop-shadow-md">M${mag}</div>
            
            <div class="flex-1 relative z-10">
                <span class="text-[9px] font-console tracking-widest uppercase mb-1 block" style="color: ${cSecondary}; filter: brightness(1.2);">Último Sismo Registrado (Radar)</span>
                <h4 class="text-sm font-bold uppercase mb-2 text-white leading-tight">${ultimoSismoObj['Referencia']}</h4>
                <div class="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-console">
                    <span class="bg-black/20 px-2 py-0.5 rounded border border-white/20"><i class="fa-regular fa-clock"></i> ${formatearFechaPeru(ultimoSismoObj['Fecha y Hora'])}</span>
                    <span class="bg-black/20 px-2 py-0.5 rounded border border-white/20">Prof: ${ultimoSismoObj['Profundidad']}</span>
                    <span class="bg-black/20 px-2 py-0.5 rounded border border-white/30" style="color: ${cSecondary};">Int: ${ultimoSismoObj['Intensidad']}</span>
                </div>
            </div>
        </div>`;
    }
    
    const tplIgp = (i) => `
        <div class="bg-white border border-slate-200 border-l-4 border-l-${i.colorClass}-500 px-3 py-2 rounded shadow-sm flex flex-col justify-between">
            <div class="flex justify-between items-center mb-1.5">
                <span class="text-[10px] font-bold font-console text-${i.colorClass}-500 bg-${i.colorClass}-50 px-1.5 py-0.5 rounded">M${i['Magnitud']}</span>
                <span class="text-[8px] font-console text-slate-400">${formatearFechaPeru(i['Fecha y Hora'])}</span>
            </div>
            <h4 class="text-[10px] font-bold text-slate-800 leading-snug mb-1 uppercase line-clamp-2">${i['Referencia']} <span class="text-slate-500 font-bold">- ${i.regionExt}</span></h4>
            <p class="text-[8px] text-slate-500 font-console uppercase mt-auto">PROF: ${i['Profundidad']} | INT: ${i['Intensidad']}</p>
        </div>`;
    html += paginarFuente("7. Últimos Sismos (IGP)", dataIgp, tplIgp, headerSismo);

    

    // ==========================================
    // PÁG FINAL: CONTRAPORTADA DE CIERRE (DISEÑO SÓLIDO GEOMÉTRICO)
    // ==========================================
    html += `
    <div class="isse-page w-[794px] h-[1123px] text-white relative overflow-hidden shadow-2xl shrink-0 flex flex-col items-center justify-center" style="background-color: ${cPrimary};">
        
        <div class="absolute z-0" style="top: -40px; left: -40px; width: 200px; height: 200px; background-color: ${cSecondary}; border-radius: 50%;"></div>
        <div class="absolute z-0" style="top: 15%; right: -50px; width: 240px; height: 60px; background-color: ${cSecondary}; border-radius: 100px;"></div>
        <div class="absolute z-0" style="bottom: 12%; left: -60px; width: 280px; height: 50px; background-color: ${cSecondary}; border-radius: 100px;"></div>
        <div class="absolute z-0" style="bottom: -50px; right: 20%; width: 150px; height: 150px; background-color: ${cSecondary}; border-radius: 50%;"></div>
        
        <div class="relative z-50 flex flex-col items-center text-center px-16 w-full">
            
            ${logoUrl ? 
                `<div class="bg-white rounded-[40px] px-12 py-8 shadow-2xl mb-10 flex items-center justify-center border-b-4" style="border-color: ${cSecondary};">
                    <img src="${logoUrl}" class="h-24 object-contain" alt="Logo Cliente Cierre">
                </div>` : 
                `<i class="fa-solid fa-brain text-[70px] mb-10" style="color: ${cSecondary};"></i>`
            }

            <h1 class="text-5xl font-bold tracking-[0.2em] font-console mb-3 uppercase">ISSE REPORT</h1>
            <h2 class="text-2xl text-white/50 font-console tracking-widest">// ${anioActualNum}</h2>
            <div class="w-16 h-1 mt-8 mb-8" style="background-color: ${cSecondary};"></div>
            <p class="text-[10px] font-bold tracking-widest uppercase text-white/50 mb-1">POWERED BY</p>
            <p class="text-xl font-console font-bold uppercase" style="color: ${cSecondary};">SAM_ENGINE</p>
        </div>

    </div>`;

    container.innerHTML = html;
}

async function solicitarExportacionPDF() {
  if (typeof Swal !== "undefined") {
    Swal.fire({
      title: "Generando Reporte ISSE",
      text: "Compilando activos gráficos y conectando con Api2Pdf...",
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading()
    });
  }

  const container = document.getElementById("isse-report-container");
  const reporteHtml = container ? container.innerHTML : "";
  const clienteSelect = document.getElementById("isse-client-selector");
  const nombreCliente = clienteSelect
    ? clienteSelect.options[clienteSelect.selectedIndex].text
    : "REPORTE";

  const htmlFinal = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { margin: 0; size: A4; }
    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .isse-page { width: 794px !important; height: 1123px !important; position: relative !important; page-break-after: always !important; page-break-inside: avoid !important; }
    .isse-page:last-child { page-break-after: auto !important; }
    div[style*='column-count'] { column-count: 2 !important; column-fill: auto !important; column-gap: 20px !important; }
    h2, h3, h4 { page-break-inside: avoid !important; break-inside: avoid !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style>
</head>
<body>${reporteHtml}</body>
</html>`;

  try {
    const response = await fetch('/api/v1/sam/exportar-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: htmlFinal, nombreCliente }),
      credentials: 'include'
    });
    const res = await response.json();

    if (res.success) {
      const byteChars = atob(res.base64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNums)], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = res.nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (typeof Swal !== "undefined") Swal.fire("Misión Cumplida", `Reporte descargado: ${res.nombreArchivo}`, "success");
    } else {
      if (typeof Swal !== "undefined") Swal.fire("Fallo de Conversión", res.error, "error");
    }
  } catch (err) {
    if (typeof Swal !== "undefined") Swal.fire("Fallo de Red", err.message, "error");
  }
}

function triggerCardAlarm(moduloNombre) {
  let card = document.querySelector(`div[onclick*="${moduloNombre}"]`);
  if (card) {
    card.classList.add('soc-alert-active');
    console.warn(`¡NUEVA ALERTA EN ${moduloNombre}!`);
    setTimeout(() => card.classList.remove('soc-alert-active'), 10000);
  }
}

function spawnSilentRadar(lat, lng, colorTailwind) {
  let colorHex = '#ef4444'; // rojo por defecto
  if (colorTailwind === 'yellow') colorHex = '#eab308';
  else if (colorTailwind === 'amber') colorHex = '#f59e0b';
  else if (colorTailwind === 'orange') colorHex = '#f97316';

  let customIcon = L.divIcon({
    html: `<div class="radar-ping" style="background-color: ${colorHex};"></div>`,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
  let tempRadar = L.marker([lat, lng], { icon: customIcon, zIndexOffset: -100 }).addTo(map);
  setTimeout(() => { if (map) map.removeLayer(tempRadar); }, 30000);
}

window.enfocarDesdeMapa = function(lat, lng, idElemento, colorTailwind, tabId) {
    
    // =========================================================================
    // 1. FASE DE BRECHA: ABRIR SIDEBAR DIRECTAMENTE CON SU FUNCIÓN NATIVA
    // =========================================================================
    if (tabId && typeof openSidebar === 'function') {
        openSidebar(tabId); // Esto inyecta el HTML (ej. htmlListaBomberos) y abre el panel
    } else {
        console.warn(`SAM: No se pudo ejecutar openSidebar para [${tabId}].`);
    }

    // =========================================================================
    // 2. FASE DE ILUMINACIÓN: ESPERAR RENDERIZADO Y APLICAR RESPLANDOR
    // =========================================================================
    // Damos 500ms para que el innerHTML se procese y la animación del sidebar termine
    setTimeout(() => {
        let tarjeta = document.getElementById(idElemento);
        
        if (tarjeta) {
            // A) Vuelo de cámara (Scroll suave hacia el centro)
            tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // B) Arsenal de Resplandor (Glow difuminado + Respiración)
            const glowClasses = [
                'ring-2', 
                `ring-${colorTailwind}-500/80`, 
                'shadow-[0_0_25px]', 
                `shadow-${colorTailwind}-500/60`, 
                'animate-pulse', 
                'z-50', 
                'scale-[1.02]',
                'transition-all',
                'duration-300'
            ];
            
            tarjeta.classList.add(...glowClasses);
            
            // C) Retirada Táctica (Apagar a los 4 segundos)
            setTimeout(() => {
                tarjeta.classList.remove(...glowClasses);
            }, 4000);
            
        } else {
            console.error(`SAM Radar: No se encontró la tarjeta [${idElemento}] en el DOM. Posible fallo de inyección HTML.`);
        }
    }, 500); // 500ms de retraso estratégico
};

function clickDesdeSidebar(lat, lng, idAcordeon, colorTailwind) {
  let content = document.getElementById(idAcordeon);
  let isOpening = !content.classList.contains('open');
  document.querySelectorAll('.expand-content').forEach(el => el.classList.remove('open'));
  if (isOpening) {
    content.classList.add('open');
    triggerRadarPing(lat, lng, colorTailwind);
    if (window.innerWidth < 768) closeSidebar();
  }
}

let marcadorAnimado = null;
function triggerRadarPing(lat, lng, colorTailwind) {
  map.flyTo([lat, lng], 14, { animate: true, duration: 1.5 });
  if (marcadorAnimado) map.removeLayer(marcadorAnimado);

  let colorHex = '#22c55e';
  if (colorTailwind === 'red') colorHex = '#ef4444';
  else if (colorTailwind === 'yellow') colorHex = '#eab308';
  else if (colorTailwind === 'amber') colorHex = '#f59e0b';
  else if (colorTailwind === 'orange') colorHex = '#f97316';

  let customIcon = L.divIcon({
    html: `<div class="radar-ping" style="background-color: ${colorHex};"></div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  marcadorAnimado = L.marker([lat, lng], { icon: customIcon }).addTo(map);
}

function buildLayerPanel(counts) {
      const content = document.getElementById('layer-content');
      
      // Inteligencia Táctica: Si hay al menos un hijo activo, el Padre se marca automáticamente
      let chkCctv = layerState['LIVE_CAMS']; // <-- NUEVO
      let chkSutran = layerState['SUTRAN_INTERRUMPIDO'] || layerState['SUTRAN_RESTRINGIDO'] || layerState['SUTRAN_NORMAL'];
      let chkCgbvp = layerState['CGBVP_INCENDIO'] || layerState['CGBVP_MATPEL'] || layerState['CGBVP_ACCVEH'] || layerState['CGBVP_EMERGMED'] || layerState['CGBVP_RESCATE'] || layerState['CGBVP_SERVESP'] || layerState['CGBVP_CERRADO'];
      let chkIgp = layerState['IGP_ALTO'] || layerState['IGP_MODERADO'] || layerState['IGP_LEVE'];
      let chkDicapi = layerState['DICAPI_ROJO'] || layerState['DICAPI_AMBAR'] || layerState['DICAPI_VERDE'];
      let chkCecom = layerState['CECOM_ALTO'] || layerState['CECOM_MEDIO'];

      content.innerHTML = `
        <div class="space-y-4">
            
            <div>
               <div>
               <div class="font-bold text-cyan-600 dark:text-cyan-400 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-cyan-500 transition-colors m-0">
                      <input type="checkbox" id="group-CCTV" onchange="toggleLayer('LIVE_CAMS')" ${chkCctv ? 'checked' : ''} class="accent-cyan-500">
                      <span><i class="fa-solid fa-video mr-1"></i> Intercepción CCTV</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded font-console">${dataCCTVGlobal.length}</span>
               </div>
            </div>

               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-orange-500 transition-colors m-0">
                      <input type="checkbox" id="group-SUTRAN" onchange="toggleGroup('SUTRAN')" ${chkSutran ? 'checked' : ''} class="accent-orange-500">
                      <span>Alertas SUTRAN</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.sutran.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('SUTRAN_INTERRUMPIDO')" ${layerState['SUTRAN_INTERRUMPIDO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Interrumpido (${counts.sutran.interrumpido})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('SUTRAN_RESTRINGIDO')" ${layerState['SUTRAN_RESTRINGIDO']?'checked':''} class="accent-yellow-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block"></span> Restringido (${counts.sutran.restringido})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('SUTRAN_NORMAL')" ${layerState['SUTRAN_NORMAL']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Normal (${counts.sutran.normal})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-red-500 transition-colors m-0">
                      <input type="checkbox" id="group-CGBVP" onchange="toggleGroup('CGBVP')" ${chkCgbvp ? 'checked' : ''} class="accent-red-500">
                      <span>Alertas CGBVP</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.cgbvp.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_INCENDIO')" ${layerState['CGBVP_INCENDIO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Incendio (${counts.cgbvp.incendio})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_MATPEL')" ${layerState['CGBVP_MATPEL']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Mat. Peligrosos (${counts.cgbvp.matpel})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_ACCVEH')" ${layerState['CGBVP_ACCVEH']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Acc. Vehicular (${counts.cgbvp.accveh})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_EMERGMED')" ${layerState['CGBVP_EMERGMED']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Emerg. Médica (${counts.cgbvp.emergmed})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_RESCATE')" ${layerState['CGBVP_RESCATE']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Rescate (${counts.cgbvp.rescate})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_SERVESP')" ${layerState['CGBVP_SERVESP']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Serv. Especial (${counts.cgbvp.servesp})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CGBVP_CERRADO')" ${layerState['CGBVP_CERRADO']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Cerrados (${counts.cgbvp.cerrado})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-amber-500 transition-colors m-0">
                      <input type="checkbox" id="group-IGP" onchange="toggleGroup('IGP')" ${chkIgp ? 'checked' : ''} class="accent-amber-500">
                      <span>Alertas IGP</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.igp.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('IGP_ALTO')" ${layerState['IGP_ALTO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Riesgo Alto (${counts.igp.alto})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('IGP_MODERADO')" ${layerState['IGP_MODERADO']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Riesgo Mod. (${counts.igp.moderado})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('IGP_LEVE')" ${layerState['IGP_LEVE']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Riesgo Leve (${counts.igp.leve})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors m-0">
                      <input type="checkbox" id="group-DICAPI" onchange="toggleGroup('DICAPI')" ${chkDicapi ? 'checked' : ''} class="accent-blue-500">
                      <span>Estado de Puertos</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${globalDicapiCounts.total}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('DICAPI_ROJO')" ${layerState['DICAPI_ROJO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Cierre Total (${globalDicapiCounts.rojo})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('DICAPI_AMBAR')" ${layerState['DICAPI_AMBAR']?'checked':''} class="accent-amber-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Cierre Parcial (${globalDicapiCounts.ambar})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('DICAPI_VERDE')" ${layerState['DICAPI_VERDE']?'checked':''} class="accent-green-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Abiertos (${globalDicapiCounts.verde})
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors m-0">
                      <input type="checkbox" id="group-CECOM" onchange="toggleGroup('CECOM')" ${chkCecom ? 'checked' : ''} class="accent-blue-500">
                      <span>Alertas SAM</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.cecom ? counts.cecom.total : 0}</span>
               </div>
               <div class="space-y-1.5 pl-5">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CECOM_ALTO')" ${layerState['CECOM_ALTO']?'checked':''} class="accent-red-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span> Riesgo Alto (${counts.cecom ? counts.cecom.alto : 0})
                  </label>
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('CECOM_MEDIO')" ${layerState['CECOM_MEDIO']?'checked':''} class="accent-yellow-500">
                     <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block animate-pulse shadow-[0_0_5px_rgba(234,179,8,0.8)]"></span> Riesgo Medio (${counts.cecom ? counts.cecom.medio : 0})
                  </label>
               </div>
            </div>           
            
            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between mt-2">
                  <span class="text-purple-500"><i class="fa-solid fa-radar"></i> Capas Analíticas</span>
               </div>
               <div class="space-y-1.5 pl-1">
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase">
                     <input type="checkbox" onchange="toggleLayer('HEATMAP')" ${layerState['HEATMAP']?'checked':''} class="accent-purple-500">
                     <i class="fa-solid fa-fire-flame-curved text-purple-500"></i> Densidad de Calor
                  </label>
                  
                  <label class="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors font-console uppercase mt-1">
                     <input type="checkbox" onchange="toggleWindLayer()" ${layerState['WIND_FLOW']?'checked':''} class="accent-cyan-400">
                     <i class="fa-solid fa-wind text-cyan-400"></i> Flujo de Viento (GFS)
                  </label>
               </div>
            </div>

            <div>
               <div class="font-bold text-gray-800 dark:text-gray-200 text-[10px] uppercase mb-1.5 border-b border-gray-200 dark:border-neutral-700 pb-1 flex justify-between items-center">
                  <label class="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors m-0">
                      <input type="checkbox" onchange="toggleLayer('SEDES')" ${layerState['SEDES']?'checked':''} class="accent-blue-500">
                      <span>Instalaciones Propias</span>
                  </label>
                  <span class="bg-gray-200 dark:bg-neutral-800 px-1.5 rounded">${counts.sedes.total}</span>
               </div>
            </div>

        </div>
      `;
  }


  function applyLayerFilters() {
  markerGroup.clearLayers();
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }

  let heatPoints = [];
  allMarkers.forEach(item => {
    if (layerState[item.layerId]) {
      item.marker.addTo(markerGroup);
      if (layerState['HEATMAP'] && item.layerId !== 'SEDES') {
        let latlng = item.marker.getLatLng();
        heatPoints.push([latlng.lat, latlng.lng, 1]);
      }
    }
  });

  if (layerState['HEATMAP'] && heatPoints.length > 0) {
    heatLayer = L.heatLayer(heatPoints, {
      radius: 20,
      blur: 25,
      maxZoom: 10,
      gradient: { 0.3: '#3b82f6', 0.5: '#22c55e', 0.7: '#eab308', 1.0: '#ef4444' }
    }).addTo(map);
  }
  syncQuickButtons();
}

function syncQuickButtons() {
  const groups = ['LIVE_CAMS', 'SEDES', 'SUTRAN', 'CGBVP', 'DICAPI', 'IGP', 'CECOM', 'HEATMAP', 'WIND_FLOW'];
  groups.forEach(g => {
    let btn = document.getElementById('btn-quick-' + g);
    if (!btn) return;
    let isActive = (g === 'LIVE_CAMS' || g === 'SEDES' || g === 'HEATMAP' || g === 'WIND_FLOW')
      ? layerState[g]
      : Object.keys(layerState).some(k => k.startsWith(g + '_') && layerState[k]);
    btn.classList.toggle('opacity-30', !isActive);
    btn.classList.toggle('grayscale', !isActive);
  });
}

function forceMapRepaint() {
  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      map.panBy([1, 0], { animate: false });
      map.panBy([-1, 0], { animate: false });
    }
  }, 300);
}

/* ==========================================
     LÓGICA DEL TOOLBAR HORIZONTAL RETRÁCTIL
     ========================================== */
  
  // Abrir y Cerrar la Barra
  function toggleTacticalToolbar(event) {
      if(event) event.stopPropagation(); 
      const toolbar = document.getElementById('tactical-toolbar');
      const trigger = document.getElementById('btn-toolbar-trigger');
      
      if (toolbar.classList.contains('hidden')) {
          toolbar.classList.remove('hidden');
          toolbar.classList.add('flex');
          trigger.classList.add('hidden');
      } else {
          cerrarTacticalToolbar();
      }
  }

  function cerrarTacticalToolbar() {
      const toolbar = document.getElementById('tactical-toolbar');
      const trigger = document.getElementById('btn-toolbar-trigger');
      if (toolbar && !toolbar.classList.contains('hidden')) {
          toolbar.classList.add('hidden');
          toolbar.classList.remove('flex');
          trigger.classList.remove('hidden');
      }
  }

  // Sensor de clics externos para auto-ocultar
  document.addEventListener('click', function(event) {
      const wrapper = document.getElementById('tactical-toolbar-wrapper');
      if (wrapper && !wrapper.contains(event.target)) {
          cerrarTacticalToolbar();
      }
  });

  setTimeout(() => {
      if(typeof map !== 'undefined' && map) {
          map.on('click', cerrarTacticalToolbar);
          map.on('dragstart', cerrarTacticalToolbar); 
      }
  }, 3000);

  /* ==========================================
     BOTONES RÁPIDOS DEL TOOLBAR (ENCENDIDO/APAGADO)
     ========================================== */
  function quickToggleGroup(group) {
      // Excepción para el motor de Viento (carga asíncrona)
      if (group === 'WIND_FLOW') {
          toggleWindLayer(); 
          return; // syncQuickButtons se ejecutará cuando termine de cargar
      }

      let currentState = false;
      
      // Consultamos el estado actual
      if (group === 'LIVE_CAMS' || group === 'SEDES' || group === 'HEATMAP') {
          currentState = layerState[group];
      } else {
          for (let key in layerState) {
              if (key.startsWith(group + '_') && layerState[key] === true) {
                  currentState = true; break;
              }
          }
      }
      
      let targetState = !currentState; 

      // Aplicamos el nuevo estado
      if (group === 'LIVE_CAMS' || group === 'SEDES' || group === 'HEATMAP') {
          layerState[group] = targetState;
          if (group === 'LIVE_CAMS') {
              if (targetState) map.addLayer(layerCCTV);
              else map.removeLayer(layerCCTV);
          }
      } else {
          for (let key in layerState) {
              if (key.startsWith(group + '_')) layerState[key] = targetState;
          }
      }

      // Disparamos el renderizado global
      applyLayerFilters();
      applyDicapiFilters();
      if (typeof buildLayerPanel === 'function' && globalCounts) buildLayerPanel(globalCounts); 
  }

  function abrirMatrixNuevaPestana() {
  if (!dataCCTVGlobal || dataCCTVGlobal.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Radar Vacío',
      text: 'No hay cámaras activas en el Data Lake.',
      background: isDarkMode ? '#171717' : '#fff',
      color: isDarkMode ? '#fff' : '#000'
    });
    return;
  }

  // 1. Guardar datos de cámaras en localStorage para que matrix.html los lea
  localStorage.setItem('sam_cctv_data', JSON.stringify(dataCCTVGlobal));

  // 2. URL del nuevo visor en el servidor Express
  const urlDestino = '/sam-engine/matrix';  // ya no usamos GitHub Pages

  console.log("SAM: Redirigiendo a Matrix en el servidor local...");
  console.log("URL Destino:", urlDestino);

  // 3. Abrir en nueva pestaña
  setTimeout(() => {
    window.open(urlDestino, '_blank');
  }, 100);
}

// TICKER DE NOTICIAS (migrado desde el js.html original)
async function refreshOSINT() {
  try {
    const res = await ApiClient.request('/api/v1/sam/noticias/ticker');
    const noticias = res.data || [];

    const tickerEl = document.getElementById('ticker-content');
    if (!tickerEl) return;

    if (noticias.length === 0) {
      tickerEl.innerHTML = '<span class="mx-4 text-blue-500"><i class="fa-solid fa-satellite-dish fa-spin mr-1"></i> Esperando señales del radar OSINT...</span>';
      return;
    }

    let tickerHtml = '';
    let totalCaracteres = 0;

    noticias.forEach(item => {
      // Formatear fecha para el ticker (dd/mm hh:mm)
      let fechaCorta = '';
      if (item.fecha) {
        const [fechaPart, horaPart] = item.fecha.split(' ');
        const [dd, mm] = fechaPart?.split('/') || [];
        fechaCorta = `${dd || '??'}/${mm || '??'}`;
        if (horaPart) fechaCorta += ` ${horaPart.substring(0, 5)}`;
      }

      const textoVisible = `[${item.fuente}] ${item.titulo} (${fechaCorta})`;
      totalCaracteres += textoVisible.length + 20;

      tickerHtml += `
        <a href="${item.enlace || '#'}" target="_blank" 
           class="mx-6 inline-flex items-center gap-1.5 text-[14px] cursor-pointer group transition-all"
           style="text-decoration: none;">
          <b class="text-purple-400 font-bold group-hover:text-purple-300 drop-shadow-md">
            ${(item.fuente || '').toUpperCase()}
          </b>
          <span class="text-white group-hover:text-blue-400 transition-colors">
            ${item.titulo || ''}
          </span>
          <span class="text-gray-400 text-[12px] font-console ml-1">
            ${fechaCorta || ''}
          </span>
          <span class="mx-4 text-gray-700 pointer-events-none">|</span>
        </a>`;
    });

    // Duplicar para scroll infinito (CSS)
    tickerEl.innerHTML = tickerHtml + tickerHtml;

    // Ajustar velocidad según la cantidad de contenido
    const duracion = Math.max(totalCaracteres * 0.19, 30);
    tickerEl.style.animationDuration = duracion + 's';
    tickerEl.style.animation = 'marquee ' + duracion + 's linear infinite';
  } catch (error) {
    console.error('Error en refreshOSINT:', error);
  }
}

// Convierte cualquier fecha (string ISO, timestamp, Date) a formato peruano legible
function formatearFechaPeru(raw) {
  if (!raw) return '--/--/---- --:--:--';

  let date;

  // Si ya es Date, usarlo directamente
  if (raw instanceof Date) {
    date = raw;
  }
  // Si es número, asumir milisegundos UTC (o segundos si es bajo)
  else if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000;
    date = new Date(ms);
  }
  // Si es string
  else {
    let str = String(raw).trim();

    // Si no tiene zona horaria explícita, añadir 'Z' para forzar UTC
    if (!/[+\-Zz]/.test(str.slice(-6))) {
      str += 'Z';
    }

    date = new Date(str);

    // Fallback: si la fecha no es válida, intentar formato dd/mm/aaaa...
    if (isNaN(date.getTime())) {
      const parts = str.split(/[\s\/\-:]+/);
      if (parts.length >= 3) {
        date = new Date(
          Date.UTC(
            parseInt(parts[2]),       // año
            parseInt(parts[1]) - 1,   // mes
            parseInt(parts[0]),       // día
            parseInt(parts[3] || 0),  // hora
            parseInt(parts[4] || 0),  // minuto
            parseInt(parts[5] || 0)   // segundo
          )
        );
      }
    }
  }

  if (isNaN(date.getTime())) return '--/--/---- --:--:--';

  // Formatear en zona horaria Perú (UTC-5)
  const opciones = {
    timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  };
  return date.toLocaleString('es-PE', opciones);
}

/**
 * ⚡ SONDA MARQUEE INTELIGENTE
 * Mide el ancho del texto vs el contenedor. Si desborda, inyecta el marquee.
 */
window.activarMarqueesInteligentes = function() {
    // Escaneamos todas las cajas de dirección
    const cajas = document.querySelectorAll('.smart-marquee-box');
    
    cajas.forEach(caja => {
        const textoEl = caja.querySelector('.smart-marquee-text');
        
        // Si el texto existe y su ancho real (scrollWidth) es mayor que la caja visible (clientWidth)
        if (textoEl && textoEl.scrollWidth > caja.clientWidth) {
            const texto = textoEl.innerText;
            // 🚀 Mutación Táctica: Lo transformamos en un marquee móvil
            caja.innerHTML = `<marquee scrollamount="4" class="w-full text-gray-200 font-extrabold uppercase">${texto}</marquee>`;
        } else if (textoEl) {
            // 🛡️ Si entra perfectamente, le aplicamos un truncate por seguridad visual
            textoEl.classList.add('truncate');
        }
    });
};