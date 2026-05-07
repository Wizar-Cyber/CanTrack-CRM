/* ============================================================
   Itinéraires — frontend logic (vanilla JS)
   API: misma origen, /api/*

   Features:
   - Settings persistidos en localStorage (home_address, units)
   - Toggle km ↔ miles para display (cálculos siempre en km en el back)
   - Mapa interactivo con Mapbox GL JS en el detalle
   - Apertura de cada parada en Google Maps / Waze / Apple Maps
   ============================================================ */

const API = "/api";
const MAX_STOPS = 30;
const STORAGE_KEY = "itineraires.settings.v1";
const KM_TO_MI = 0.621371;

// ============================== Settings (localStorage) ============================== //
const Settings = {
  _data: { home_address: "", units: "km" },

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this._data = { ...this._data, ...parsed };
        }
      }
    } catch (e) {
      console.warn("Settings: no se pudo leer localStorage", e);
    }
    // Validar units
    if (!["km", "mi"].includes(this._data.units)) this._data.units = "km";
    return this._data;
  },

  save(patch) {
    this._data = { ...this._data, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.warn("Settings: no se pudo escribir localStorage", e);
    }
    return this._data;
  },

  get() { return { ...this._data }; },
};

// ============================== State ============================== //
const state = {
  view: "list",
  filterStatus: "",
  routes: [],
  currentRoute: null,
  draftStops: [],
  serverConfig: null,   // { mapbox_public_token, proximity_lng, proximity_lat, ... }
  map: null,            // instancia activa de mapboxgl.Map
  mapMarkers: [],
};

// ============================== Helpers ============================== //
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showLoader(text = "Chargement...") {
  $("#loader-text").textContent = text;
  $("#loader").classList.remove("hidden");
}
function hideLoader() { $("#loader").classList.add("hidden"); }

function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast";
  if (kind) el.classList.add(kind);
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    let payload;
    try { payload = await res.json(); } catch { payload = { message: res.statusText }; }
    const err = new Error(payload.message || "Erreur");
    err.code = payload.code;
    err.details = payload.details;
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-CA", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ============================== Unit conversion ============================== //
function units() { return Settings.get().units; }

function convertKm(km) {
  if (km == null) return null;
  return units() === "mi" ? km * KM_TO_MI : km;
}
function convertSpeedKmh(kmh) {
  if (kmh == null) return null;
  return units() === "mi" ? kmh * KM_TO_MI : kmh;
}
function distLabel() { return units() === "mi" ? "mi" : "km"; }
function speedLabel() { return units() === "mi" ? "mph" : "km/h"; }

function fmtDist(km) {
  if (km == null) return "—";
  const v = convertKm(km);
  const u = distLabel();
  return v < 10 ? `${v.toFixed(1)} ${u}` : `${Math.round(v)} ${u}`;
}
function fmtSpeed(kmh) {
  if (kmh == null) return "—";
  return `${Math.round(convertSpeedKmh(kmh))} ${speedLabel()}`;
}
function fmtMin(m) {
  if (m == null) return "—";
  if (m < 60) return Math.round(m) + " min";
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return mm ? `${h}h ${mm}` : `${h}h`;
}

function statusLabel(s) {
  return {
    pending: "À faire",
    in_progress: "En cours",
    completed: "Terminée",
    cancelled: "Annulée",
  }[s] || s;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}
function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + "…" : (s || ""); }

// ============================== Server config (Mapbox token) ============================== //
async function loadServerConfig() {
  if (state.serverConfig) return state.serverConfig;
  try {
    state.serverConfig = await api("GET", "/config");
  } catch (e) {
    console.warn("No se pudo cargar /api/config:", e);
    state.serverConfig = null;
  }
  return state.serverConfig;
}

// ============================== Routing (views) ============================== //
function showView(name) {
  state.view = name;
  $$(".view").forEach(v => v.classList.toggle("is-active", v.id === `view-${name}`));
  $$(".tab").forEach(t => {
    if (t.dataset.view) t.classList.toggle("is-active", t.dataset.view === name);
  });
  // Limpiar mapa al salir del detalle
  if (name !== "detail") destroyMap();
  if (name === "list") loadRoutes();
  if (name === "create") prefillCreateForm();
}

function prefillCreateForm() {
  const home = Settings.get().home_address;
  const $start = $("#f-start");
  const $btnHome = $("#btn-use-home");
  if (home) {
    if (!$start.value) {
      $start.value = home;
      // Geocodificar para mostrar el pill verde
      debouncedGeocodeStart();
    }
    $btnHome.hidden = false;
  } else {
    $btnHome.hidden = true;
  }
}

// ============================== List view ============================== //
async function loadRoutes() {
  const params = new URLSearchParams();
  if (state.filterStatus) params.set("status", state.filterStatus);
  params.set("limit", "100");
  try {
    const data = await api("GET", `/routes?${params.toString()}`);
    state.routes = data.items;
    renderRoutes();
  } catch (err) {
    toast("Erreur de chargement", "error");
    console.error(err);
  }
}

function renderRoutes() {
  const list = $("#routes-list");
  const empty = $("#empty-state");
  list.innerHTML = "";

  if (!state.routes.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const r of state.routes) {
    const card = document.createElement("article");
    card.className = "route-card";
    card.dataset.id = r.id;
    card.innerHTML = `
      <div class="route-card-head">
        <h2 class="route-card-title">${escapeHtml(r.name)}</h2>
        <span class="pill pill-${r.status}">${statusLabel(r.status)}</span>
      </div>
      <p class="route-card-meta">${fmtDate(r.created_at)} · départ ${escapeHtml(truncate(r.start_address, 40))}</p>
      <div class="route-stats">
        <div><span class="stat-label">Arrêts</span><span class="stat-value">${r.completed_stops_count}/${r.stops_count}</span></div>
        <div><span class="stat-label">Distance</span><span class="stat-value">${fmtDist(r.total_distance_km)}</span></div>
        <div><span class="stat-label">Durée</span><span class="stat-value">${fmtMin(r.estimated_time_minutes)}</span></div>
      </div>
    `;
    card.addEventListener("click", () => openDetail(r.id));
    list.appendChild(card);
  }
}

// ============================== Create view ============================== //
function bindCreateView() {
  const stopInput = $("#f-stop");
  $("#btn-add-stop").addEventListener("click", () => addDraftStop(stopInput.value));
  stopInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDraftStop(stopInput.value);
    }
  });

  $("#f-start").addEventListener("blur", debouncedGeocodeStart);

  $("#btn-use-home").addEventListener("click", () => {
    const home = Settings.get().home_address;
    if (home) {
      $("#f-start").value = home;
      debouncedGeocodeStart();
    }
  });

  $("#form-create").addEventListener("submit", onSubmitCreate);
}

let _geocodeStartTimer = null;
function debouncedGeocodeStart() {
  clearTimeout(_geocodeStartTimer);
  const v = $("#f-start").value.trim();
  if (v.length < 5) return;
  setStatusPill("status-start", "loading", "...");
  _geocodeStartTimer = setTimeout(async () => {
    const r = await tryGeocode(v);
    paintStatusFromResult("status-start", r);
  }, 300);
}

async function tryGeocode(address) {
  try {
    return await api("POST", "/geocode", { address });
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

function setStatusPill(id, kind, text) {
  const el = document.getElementById(id);
  el.className = "status-pill " + kind;
  el.textContent = text;
}

function paintStatusFromResult(pillId, result) {
  if (!result) return setStatusPill(pillId, "", "");
  switch (result.status) {
    case "ok":             return setStatusPill(pillId, "ok",   "✓ localisée");
    case "ambiguous":      return setStatusPill(pillId, "warn", "⚠ ambigüe");
    case "out_of_region":  return setStatusPill(pillId, "error","✗ hors Québec");
    case "not_found":      return setStatusPill(pillId, "error","✗ introuvable");
    default:               return setStatusPill(pillId, "error","✗ erreur");
  }
}

async function addDraftStop(rawAddress) {
  const address = (rawAddress || "").trim();
  if (address.length < 5) { toast("Adresse trop courte", "warn"); return; }
  if (state.draftStops.length >= MAX_STOPS) { toast(`Maximum ${MAX_STOPS} arrêts`, "warn"); return; }

  const item = { address, status: "loading", meta: null };
  state.draftStops.push(item);
  renderDraftStops();
  $("#f-stop").value = "";

  const res = await tryGeocode(address);
  item.status = res.status === "ok" ? "ok" :
                res.status === "ambiguous" ? "warn" :
                res.status === "out_of_region" ? "error" :
                res.status === "not_found" ? "error" : "error";
  item.meta = res;
  renderDraftStops();
}

function renderDraftStops() {
  const list = $("#stops-list");
  list.innerHTML = "";
  state.draftStops.forEach((s, i) => {
    const li = document.createElement("li");
    const icon = { ok: "✓", warn: "⚠", error: "✗", loading: "..." }[s.status] || "";
    li.innerHTML = `
      <span class="stop-num">${i + 1}.</span>
      <span class="stop-text">${escapeHtml(s.address)}</span>
      <span class="stop-status ${s.status}" title="${s.meta?.status || ''}">${icon}</span>
      <button class="stop-remove" data-i="${i}" type="button" aria-label="Retirer">×</button>
    `;
    li.querySelector(".stop-remove").addEventListener("click", () => {
      state.draftStops.splice(i, 1);
      renderDraftStops();
    });
    list.appendChild(li);
  });
  $("#stops-count").textContent = `(${state.draftStops.length}/${MAX_STOPS})`;
}

async function onSubmitCreate(e) {
  e.preventDefault();
  $("#form-error").classList.add("hidden");

  const name = $("#f-name").value.trim();
  const start_address = $("#f-start").value.trim();
  const stops = state.draftStops.map(s => s.address);
  const return_to_start = $("#f-return").checked;
  // Speed: el input está en la unidad activa. Convertir SIEMPRE a km/h para el back.
  const speedRaw = parseFloat($("#f-speed").value) || 30;
  const average_speed_kmh = units() === "mi" ? speedRaw / KM_TO_MI : speedRaw;
  const notes = $("#f-notes").value.trim() || null;

  if (!name || !start_address || stops.length === 0) {
    showFormError("Remplissez le nom, l'adresse de départ et au moins un arrêt.");
    return;
  }

  const bad = state.draftStops.filter(s => s.status === "error");
  if (bad.length) {
    if (!confirm(`${bad.length} arrêt(s) n'ont pas pu être validés. Continuer quand même ?`)) return;
  }

  $("#btn-submit").disabled = true;
  showLoader("Optimisation de la route...");

  try {
    const created = await api("POST", "/routes", {
      name, start_address, stops, return_to_start, average_speed_kmh, notes,
    });
    toast("Route créée et optimisée", "");
    state.draftStops = [];
    e.target.reset();
    renderDraftStops();
    setStatusPill("status-start", "", "");
    showView("list");
    setTimeout(() => openDetail(created.id), 200);
  } catch (err) {
    if (err.code === "geocoding_ambiguous") {
      showFormError(`Une adresse est ambiguë. Précisez-la et réessayez. ${err.message}`);
    } else if (err.code === "geocoding_out_of_region") {
      showFormError(`Une adresse est hors du Québec. ${err.message}`);
    } else if (err.code === "geocoding_failed") {
      showFormError(`Une adresse n'a pas pu être géocodée. ${err.message}`);
    } else {
      showFormError(err.message || "Erreur inconnue");
    }
  } finally {
    hideLoader();
    $("#btn-submit").disabled = false;
  }
}

function showFormError(msg) {
  const el = $("#form-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ============================== Detail view ============================== //
async function openDetail(id) {
  showView("detail");
  $("#detail-content").innerHTML = '<p style="opacity:.5;text-align:center;padding:40px">Chargement...</p>';
  try {
    state.currentRoute = await api("GET", `/routes/${id}`);
    renderDetail();
  } catch (err) {
    $("#detail-content").innerHTML = `<p>Erreur: ${escapeHtml(err.message)}</p>`;
  }
}

function renderDetail() {
  const r = state.currentRoute;
  if (!r) return;

  const visited = r.stops.filter(s => s.status === "visited").length;
  const total = r.stops.length;

  let actions = "";
  if (r.status === "pending") {
    actions = `
      <div class="detail-actions">
        <button class="btn-primary" id="btn-start">Démarrer</button>
        <button class="btn-secondary" id="btn-maps">Itinéraire complet</button>
      </div>
      <div class="detail-actions single">
        <button class="btn-secondary" id="btn-cancel" style="border-color:var(--danger);color:var(--danger)">Annuler</button>
      </div>
    `;
  } else if (r.status === "in_progress") {
    actions = `
      <div class="detail-actions">
        <button class="btn-secondary" id="btn-pause">Pause</button>
        <button class="btn-secondary" id="btn-maps">Itinéraire</button>
        <button class="btn-primary" id="btn-complete">Terminer</button>
      </div>
    `;
  } else {
    actions = `
      <div class="detail-actions single">
        <button class="btn-secondary" id="btn-maps">Voir l'itinéraire</button>
      </div>
    `;
  }

  const stopsHtml = r.stops.map(s => stopHtml(s, r.status)).join("");

  $("#detail-content").innerHTML = `
    <div class="detail-head">
      <span class="pill pill-${r.status}">${statusLabel(r.status)}</span>
      <h1 class="detail-title">${escapeHtml(r.name)}</h1>
      <div class="detail-meta">${fmtDate(r.created_at)} · ${visited}/${total} arrêts visités</div>
    </div>

    <div class="map-container">
      <div id="map"></div>
      <div class="map-fallback hidden" id="map-fallback">
        <span class="map-fallback-icon">⌖</span>
        <span id="map-fallback-msg">Carte indisponible</span>
      </div>
    </div>

    <div class="detail-stats">
      <div><span class="stat-label">Distance</span><span class="stat-value">${fmtDist(r.total_distance_km)}</span></div>
      <div><span class="stat-label">Durée est.</span><span class="stat-value">${fmtMin(r.estimated_time_minutes)}</span></div>
      <div><span class="stat-label">Vitesse</span><span class="stat-value">${fmtSpeed(r.average_speed_kmh)}</span></div>
    </div>

    ${actions}

    ${r.notes ? `<p style="font-style:italic;color:var(--ink-soft);background:var(--paper-2);padding:12px 14px;border-left:3px solid var(--accent);border-radius:4px;font-size:14px">${escapeHtml(r.notes)}</p>` : ""}

    <h3 style="font-family:var(--font-display);font-size:22px;font-weight:600;margin:24px 0 6px">Itinéraire</h3>
    <p style="font-family:var(--font-mono);font-size:11px;color:var(--ink-mute);margin:0 0 14px;text-transform:uppercase;letter-spacing:.08em">Départ → ${escapeHtml(truncate(r.start_address, 40))}</p>
    <ol class="stops-display">${stopsHtml}</ol>
  `;

  bindDetailActions(r);
  // Inicializar mapa async
  renderMap(r);
}

function stopHtml(s, routeStatus) {
  const cls = `stop-item is-${s.status}`;
  const canAct = routeStatus === "in_progress" && s.status === "pending";
  return `
    <li class="${cls}" data-stop-id="${s.id}">
      <div class="stop-order">${s.order}</div>
      <div class="stop-body">
        <p class="stop-name">${escapeHtml(s.address)}</p>
        <span class="stop-distance">${fmtDist(s.distance_from_previous_km)} depuis l'arrêt précédent</span>
        ${s.notes ? `<p style="font-size:12px;color:var(--ink-mute);margin:4px 0 0;font-style:italic">${escapeHtml(s.notes)}</p>` : ""}
        <div class="stop-nav-row">
          <a class="nav-btn google" href="${navUrl('google', s.lat, s.lng, s.address)}" target="_blank" rel="noopener" aria-label="Google Maps"><span class="nav-btn-icon">G</span> Maps</a>
          <a class="nav-btn waze"   href="${navUrl('waze',   s.lat, s.lng, s.address)}" target="_blank" rel="noopener" aria-label="Waze"><span class="nav-btn-icon">W</span> Waze</a>
          <a class="nav-btn apple"  href="${navUrl('apple',  s.lat, s.lng, s.address)}" target="_blank" rel="noopener" aria-label="Apple Maps"><span class="nav-btn-icon">⌘</span> Apple</a>
        </div>
      </div>
      <div class="stop-actions">
        <button class="stop-action visit" data-action="visited" ${canAct ? "" : "disabled"} aria-label="Visité">✓</button>
        <button class="stop-action skip"  data-action="skipped" ${canAct ? "" : "disabled"} aria-label="Sauté">⤳</button>
      </div>
    </li>
  `;
}

function bindDetailActions(r) {
  const start = $("#btn-start");
  if (start) start.addEventListener("click", () => updateRouteStatus("in_progress"));
  const pause = $("#btn-pause");
  if (pause) pause.addEventListener("click", () => updateRouteStatus("pending"));
  const complete = $("#btn-complete");
  if (complete) complete.addEventListener("click", () => {
    if (confirm("Terminer la route ? Les arrêts non visités seront marqués sautés.")) {
      updateRouteStatus("completed");
    }
  });
  const cancel = $("#btn-cancel");
  if (cancel) cancel.addEventListener("click", () => {
    if (confirm("Annuler cette route ?")) updateRouteStatus("cancelled");
  });
  const maps = $("#btn-maps");
  if (maps) maps.addEventListener("click", () => openFullRouteInMaps(r));

  $$(".stop-action").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const li = e.currentTarget.closest("[data-stop-id]");
      const stopId = li.dataset.stopId;
      const action = e.currentTarget.dataset.action;
      updateStop(stopId, action);
    });
  });
}

async function updateRouteStatus(status) {
  showLoader("Mise à jour...");
  try {
    state.currentRoute = await api("PATCH", `/routes/${state.currentRoute.id}/status`, { status });
    renderDetail();
    toast("Mis à jour");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    hideLoader();
  }
}

async function updateStop(stopId, status) {
  try {
    state.currentRoute = await api(
      "PATCH",
      `/routes/${state.currentRoute.id}/stops/${stopId}`,
      { status }
    );
    renderDetail();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ============================== Deep links Google / Waze / Apple ============================== //
function navUrl(provider, lat, lng, address) {
  const ll = `${lat},${lng}`;
  const q = encodeURIComponent(address || ll);
  switch (provider) {
    case "google":
      // Funciona en web y app de Google Maps en cualquier plataforma
      return `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
    case "waze":
      // Waze deep-link universal: abre la app si está instalada, web si no
      return `https://waze.com/ul?ll=${ll}&navigate=yes`;
    case "apple":
      return `https://maps.apple.com/?daddr=${ll}&q=${q}`;
    default:
      return "#";
  }
}

function openFullRouteInMaps(route) {
  // Ruta completa con waypoints. Apple Maps en iOS, Google Maps en el resto.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const wp = route.stops.map(s => `${s.lat},${s.lng}`);
  const start = `${route.start_lat},${route.start_lng}`;

  if (isIOS) {
    const dest = wp.length ? wp[wp.length - 1] : start;
    window.open(`https://maps.apple.com/?saddr=${start}&daddr=${dest}`, "_blank");
  } else {
    const params = new URLSearchParams({
      api: "1",
      origin: start,
      destination: wp.length ? wp[wp.length - 1] : start,
      travelmode: "driving",
    });
    if (wp.length > 1) {
      params.set("waypoints", wp.slice(0, -1).join("|"));
    }
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
  }
}

// ============================== Mapbox GL JS map ============================== //
function destroyMap() {
  if (state.map) {
    try { state.map.remove(); } catch {}
    state.map = null;
  }
  state.mapMarkers = [];
}

function showMapFallback(msg) {
  const fb = document.getElementById("map-fallback");
  const m = document.getElementById("map-fallback-msg");
  if (fb) fb.classList.remove("hidden");
  if (m && msg) m.textContent = msg;
}

let _mapboxLoading = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return true;
  if (_mapboxLoading) return _mapboxLoading;

  _mapboxLoading = new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css";
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return _mapboxLoading;
}

async function renderMap(route) {
  destroyMap();
  await loadServerConfig();

  const cfg = state.serverConfig;
  if (!cfg || !cfg.mapbox_public_token) {
    showMapFallback("Configurez MAPBOX_PUBLIC_TOKEN pour afficher la carte");
    return;
  }

  const ok = await ensureMapboxLoaded();
  if (!ok || !window.mapboxgl) {
    showMapFallback("Impossible de charger la bibliothèque cartographique");
    return;
  }

  // Validar que tenemos coordenadas
  if (route.start_lat == null || route.start_lng == null) {
    showMapFallback("Coordonnées de départ manquantes");
    return;
  }

  window.mapboxgl.accessToken = cfg.mapbox_public_token;

  const container = document.getElementById("map");
  if (!container) return;

  const startCoord = [route.start_lng, route.start_lat];
  const stopCoords = route.stops.map(s => [s.lng, s.lat]);
  const allCoords = [startCoord, ...stopCoords];
  if (route.return_to_start) allCoords.push(startCoord);

  const map = new window.mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    bounds: bboxOf(allCoords),
    fitBoundsOptions: { padding: 40, maxZoom: 14 },
    attributionControl: false,
  });
  state.map = map;

  map.addControl(new window.mapboxgl.AttributionControl({ compact: true }));
  map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
    // Línea conectando paradas en orden
    map.addSource("route-line", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: allCoords },
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#2d5a3d",
        "line-width": 3,
        "line-opacity": 0.85,
        "line-dasharray": [1, 0],
      },
    });

    // Marker de inicio (negro, con etiqueta)
    addCustomMarker(map, startCoord, "MAISON", "start", route.start_address);

    // Markers numerados de paradas
    route.stops.forEach((s) => {
      const cls = s.status === "visited" ? "visited" :
                  s.status === "skipped" ? "skipped" :
                  s.status === "failed"  ? "failed"  : "";
      addCustomMarker(map, [s.lng, s.lat], String(s.order), cls, s.address);
    });
  });

  map.on("error", (e) => {
    console.error("Mapbox error:", e);
    // Si el token es inválido el mapa queda en blanco — mostrar fallback
    showMapFallback("Erreur de la carte (token invalide?)");
  });
}

function addCustomMarker(map, lngLat, label, kind, popupText) {
  const el = document.createElement("div");
  el.className = "map-marker " + (kind || "");
  el.textContent = label;

  const marker = new window.mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat(lngLat);

  if (popupText) {
    const popup = new window.mapboxgl.Popup({ offset: 22, closeButton: false })
      .setText(popupText);
    marker.setPopup(popup);
  }

  marker.addTo(map);
  state.mapMarkers.push(marker);
}

function bboxOf(coords) {
  let minLng = +Infinity, minLat = +Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

// ============================== Settings modal ============================== //
function openSettings() {
  const s = Settings.get();
  $("#s-home").value = s.home_address || "";
  setStatusPill("status-home", "", "");
  // Reflejar la unidad activa en el toggle del modal
  $$(".unit-btn[data-unit-modal]").forEach(b => {
    b.classList.toggle("is-active", b.dataset.unitModal === s.units);
  });
  $("#settings-modal").classList.remove("hidden");

  // Validar la dirección actual al abrir, si hay una
  if (s.home_address) {
    setStatusPill("status-home", "loading", "...");
    tryGeocode(s.home_address).then(r => paintStatusFromResult("status-home", r));
  }
}

function closeSettings() {
  $("#settings-modal").classList.add("hidden");
}

function bindSettingsModal() {
  $("#btn-settings").addEventListener("click", openSettings);
  $$("[data-close-modal]").forEach(el => el.addEventListener("click", closeSettings));

  // Validar dirección al perder foco
  let homeTimer = null;
  $("#s-home").addEventListener("blur", () => {
    clearTimeout(homeTimer);
    const v = $("#s-home").value.trim();
    if (v.length < 5) { setStatusPill("status-home", "", ""); return; }
    setStatusPill("status-home", "loading", "...");
    homeTimer = setTimeout(async () => {
      const r = await tryGeocode(v);
      paintStatusFromResult("status-home", r);
    }, 300);
  });

  // Toggle unidades dentro del modal
  $$(".unit-btn[data-unit-modal]").forEach(b => {
    b.addEventListener("click", () => {
      $$(".unit-btn[data-unit-modal]").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
    });
  });

  $("#btn-save-settings").addEventListener("click", () => {
    const home = $("#s-home").value.trim();
    const activeUnit = document.querySelector(".unit-btn[data-unit-modal].is-active");
    const newUnit = activeUnit ? activeUnit.dataset.unitModal : "km";

    Settings.save({ home_address: home, units: newUnit });
    syncUnitTopbar();
    closeSettings();
    toast("Paramètres enregistrés");

    // Re-render para reflejar nueva unidad y tener el home address disponible
    if (state.view === "list") renderRoutes();
    else if (state.view === "detail" && state.currentRoute) renderDetail();
    else if (state.view === "create") prefillCreateForm();

    updateSpeedFieldUnit();
  });
}

// ============================== Topbar unit toggle ============================== //
function bindTopbarUnits() {
  $$(".unit-toggle .unit-btn[data-unit]").forEach(b => {
    b.addEventListener("click", () => {
      const u = b.dataset.unit;
      $$(".unit-toggle .unit-btn[data-unit]").forEach(x =>
        x.classList.toggle("is-active", x.dataset.unit === u));
      Settings.save({ units: u });

      // Re-render lo visible
      if (state.view === "list") renderRoutes();
      else if (state.view === "detail" && state.currentRoute) renderDetail();
      updateSpeedFieldUnit();
    });
  });
}

function syncUnitTopbar() {
  const u = Settings.get().units;
  $$(".unit-toggle .unit-btn[data-unit]").forEach(b =>
    b.classList.toggle("is-active", b.dataset.unit === u));
}

function updateSpeedFieldUnit() {
  const $unitLabel = document.querySelector(".speed-unit");
  const $speed = $("#f-speed");
  if (!$unitLabel || !$speed) return;
  const u = units();
  // Si el campo tiene un valor, convertir
  const cur = parseFloat($speed.value);
  const wasMi = $unitLabel.textContent.includes("mph");
  const isMi  = u === "mi";
  if (!Number.isNaN(cur) && wasMi !== isMi) {
    if (isMi) $speed.value = (cur * KM_TO_MI).toFixed(0);
    else      $speed.value = (cur / KM_TO_MI).toFixed(0);
  }
  $unitLabel.textContent = `(${speedLabel()})`;
}

// ============================== Bindings globales ============================== //
function bindGlobal() {
  $$(".tab").forEach(t => {
    t.addEventListener("click", () => {
      if (t.dataset.view) showView(t.dataset.view);
    });
  });
  $("#fab-new").addEventListener("click", () => showView("create"));
  $("#btn-back").addEventListener("click", () => showView("list"));

  $$(".filter").forEach(f => {
    f.addEventListener("click", () => {
      $$(".filter").forEach(x => x.classList.remove("is-active"));
      f.classList.add("is-active");
      state.filterStatus = f.dataset.status;
      loadRoutes();
    });
  });

  bindCreateView();
  bindSettingsModal();
  bindTopbarUnits();
}

// ============================== Init ============================== //
document.addEventListener("DOMContentLoaded", () => {
  Settings.load();
  syncUnitTopbar();
  updateSpeedFieldUnit();
  bindGlobal();
  loadRoutes();
  // Pre-cargar config en background (token de Mapbox para el mapa)
  loadServerConfig();
});
