/* Optimus Rutas — frontend logic */

const API = "/api";
const MAX_STOPS = 30;
const STORAGE_KEY = "optimus.settings.v3";
const KM_TO_MI = 0.621371;

// ─── Settings ────────────────────────────────────────────────────────────────
const Settings = {
  _d: { home_address: "", units: "km" },
  load() {
    try { const r = localStorage.getItem(STORAGE_KEY); if (r) this._d = { ...this._d, ...JSON.parse(r) }; } catch {}
    if (!["km","mi"].includes(this._d.units)) this._d.units = "km";
    return this._d;
  },
  save(p) { this._d = { ...this._d, ...p }; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._d)); } catch {} },
  get() { return { ...this._d }; },
};

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  view: "list",
  filterStatus: "",
  routes: [],
  currentRoute: null,
  draftStops: [],
  serverConfig: null,
  map: null,
  mapMarkers: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function showLoader(t = "Cargando...") { $("#loader-text").textContent = t; $("#loader").classList.remove("hidden"); }
function hideLoader() { $("#loader").classList.add("hidden"); }

function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (kind ? " " + kind : "");
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3500);
}

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    let p; try { p = await res.json(); } catch { p = { message: res.statusText }; }
    const err = new Error(p.message || "Error"); err.code = p.code; err.status = res.status; throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

function units() { return Settings.get().units || "km"; }
function speedLabel() { return units() === "mi" ? "mph" : "km/h"; }

function fmtDist(km) {
  if (km == null || isNaN(km)) return "—";
  if (units() === "mi") return (km * KM_TO_MI).toFixed(1) + " mi";
  return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
}
function fmtMin(m) {
  if (m == null || isNaN(m)) return "—";
  const h = Math.floor(m / 60), min = Math.round(m % 60);
  return h === 0 ? `${min}m` : `${h}h ${min}m`;
}
function fmtSpeed(kmh) {
  if (kmh == null) return "—";
  return units() === "mi" ? (kmh * KM_TO_MI).toFixed(0) + " mph" : Math.round(kmh) + " km/h";
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CA", { day: "numeric", month: "short" });
}
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + "…" : (s || ""); }

function statusLabel(s) {
  return { draft:"Borrador", pending:"Pendiente", active:"Activa", in_progress:"En progreso", paused:"Pausada", completed:"Completada", cancelled:"Cancelada" }[s] || s;
}
function stopStatusLabel(s) {
  return { pending:"Pendiente", visited:"Visitada", skipped:"Omitida", failed:"Fallida" }[s] || s;
}
function isVirtualAddress(addr) {
  if (!addr) return true;
  const l = addr.toLowerCase();
  return l.includes("virtual") || l.includes("no tiene") || l.includes("sin direcci") || addr.trim().length < 5;
}

// ─── Server config (Mapbox token) ────────────────────────────────────────────
async function loadServerConfig() {
  if (state.serverConfig) return state.serverConfig;
  try { state.serverConfig = await api("GET", "/config"); }
  catch { state.serverConfig = null; }
  return state.serverConfig;
}

// ─── Views ────────────────────────────────────────────────────────────────────
function showView(name) {
  state.view = name;
  $$(".view").forEach(v => v.classList.toggle("is-active", v.id === `view-${name}`));
  $$(".tab").forEach(t => { if (t.dataset.view) t.classList.toggle("is-active", t.dataset.view === name); });
  if (name !== "detail") destroyMap();
  if (name === "list") loadRoutes();
  if (name === "create") prefillCreateForm();
}

function prefillCreateForm() {
  const home = Settings.get().home_address;
  const $start = $("#f-start");
  const $btn = $("#btn-use-home");
  if (home && !$start.value) { $start.value = home; debouncedGeocodeStart(); }
  $btn.hidden = !home;
}

// ─── List ──────────────────────────────────────────────────────────────────────
async function loadRoutes() {
  const params = new URLSearchParams();
  if (state.filterStatus) params.set("status", state.filterStatus);
  params.set("limit", "100");
  try {
    const data = await api("GET", `/routes?${params.toString()}`);
    state.routes = data.items;
    renderRoutes();
  } catch (err) {
    toast("Error al cargar las rutas", "error");
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
    const visited = r.completed_stops_count || 0;
    const total = r.stops_count || 0;
    const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

    const card = document.createElement("article");
    card.className = "route-card";
    card.dataset.id = r.id;
    card.innerHTML = `
      <div class="route-card-head">
        <h2 class="route-card-title">${esc(r.name)}</h2>
        <span class="pill pill-${r.status}">${statusLabel(r.status)}</span>
      </div>
      <p class="route-card-meta">${fmtDate(r.created_at)} · ${esc(truncate(r.start_address, 38))}</p>
      <div class="route-stats">
        <div class="route-stat">
          <span class="stat-label">Paradas</span>
          <span class="stat-value">${visited}/${total}</span>
        </div>
        <div class="route-stat">
          <span class="stat-label">Distancia</span>
          <span class="stat-value">${fmtDist(r.total_distance_km)}</span>
        </div>
        <div class="route-stat">
          <span class="stat-label">Duración</span>
          <span class="stat-value">${fmtMin(r.estimated_time_minutes)}</span>
        </div>
      </div>
      ${total > 0 ? `
        <div class="route-progress" title="${pct}% completada">
          <div class="route-progress-bar" style="width:${pct}%"></div>
        </div>
      ` : ""}
    `;
    card.addEventListener("click", () => openDetail(r.id));
    list.appendChild(card);
  }
}

// ─── Create form ──────────────────────────────────────────────────────────────
function bindCreateView() {
  $("#btn-add-stop").addEventListener("click", () => addDraftStop($("#f-stop").value));
  $("#f-stop").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addDraftStop($("#f-stop").value); } });
  $("#f-start").addEventListener("blur", debouncedGeocodeStart);
  $("#btn-use-home").addEventListener("click", () => {
    const home = Settings.get().home_address;
    if (home) { $("#f-start").value = home; debouncedGeocodeStart(); }
  });
  $("#form-create").addEventListener("submit", onSubmitCreate);
}

let _geocodeTimer = null;
function debouncedGeocodeStart() {
  clearTimeout(_geocodeTimer);
  const v = $("#f-start").value.trim();
  if (v.length < 5) return;
  setStatusPill("status-start", "loading", "...");
  _geocodeTimer = setTimeout(async () => {
    const r = await tryGeocode(v);
    paintGeoStatus("status-start", r);
  }, 400);
}

async function tryGeocode(addr) {
  try { return await api("POST", "/geocode", { address: addr }); }
  catch (e) { return { status: "error" }; }
}

function setStatusPill(id, kind, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = "status-pill" + (kind ? " " + kind : "");
  el.textContent = text;
}
function paintGeoStatus(pillId, r) {
  if (!r) return setStatusPill(pillId, "", "");
  const map = { ok: ["ok","✓ OK"], ambiguous: ["warn","⚠ Ambigua"], out_of_region: ["error","✗ Región"], not_found: ["error","✗ No encontrada"] };
  const [kind, text] = map[r.status] || ["error","✗ Error"];
  setStatusPill(pillId, kind, text);
}

async function addDraftStop(rawAddr) {
  const addr = (rawAddr || "").trim();
  if (addr.length < 5) { toast("Dirección muy corta", "warn"); return; }
  if (state.draftStops.length >= MAX_STOPS) { toast(`Máximo ${MAX_STOPS} paradas`, "warn"); return; }
  const item = { address: addr, status: "loading", meta: null };
  state.draftStops.push(item);
  renderDraftStops();
  $("#f-stop").value = "";
  const res = await tryGeocode(addr);
  item.status = { ok:"ok", ambiguous:"warn" }[res?.status] || "error";
  item.meta = res;
  renderDraftStops();
}

function renderDraftStops() {
  const list = $("#stops-list");
  list.innerHTML = "";
  state.draftStops.forEach((s, i) => {
    const li = document.createElement("li");
    const icon = { ok:"✓", warn:"⚠", error:"✗", loading:"…" }[s.status] || "";
    li.innerHTML = `
      <span class="stop-num">${i + 1}.</span>
      <span class="stop-text">${esc(s.address)}</span>
      <span class="stop-status ${s.status}">${icon}</span>
      <button class="stop-remove" data-i="${i}" type="button" aria-label="Eliminar">×</button>
    `;
    li.querySelector(".stop-remove").addEventListener("click", () => { state.draftStops.splice(i, 1); renderDraftStops(); });
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
  const speedRaw = parseFloat($("#f-speed").value) || 30;
  const average_speed_kmh = units() === "mi" ? speedRaw / KM_TO_MI : speedRaw;
  const notes = $("#f-notes").value.trim() || null;

  if (!name || !start_address || stops.length === 0) {
    showFormError("Completa el nombre, la dirección de salida y al menos una parada.");
    return;
  }
  const bad = state.draftStops.filter(s => s.status === "error");
  if (bad.length && !confirm(`${bad.length} parada(s) no se pudieron validar. ¿Continuar?`)) return;

  $("#btn-submit").disabled = true;
  showLoader("Optimizando ruta...");
  try {
    const created = await api("POST", "/routes", { name, start_address, stops, return_to_start, average_speed_kmh, notes });
    toast("Ruta creada y optimizada ✓");
    state.draftStops = [];
    e.target.reset();
    renderDraftStops();
    setStatusPill("status-start", "", "");
    showView("list");
    setTimeout(() => openDetail(created.id), 200);
  } catch (err) {
    showFormError(err.message || "Error desconocido");
  } finally {
    hideLoader();
    $("#btn-submit").disabled = false;
  }
}

function showFormError(msg) {
  const el = $("#form-error");
  el.innerHTML = `<span>⚠</span> ${esc(msg)}`;
  el.classList.remove("hidden");
}

// ─── Detail ───────────────────────────────────────────────────────────────────
async function openDetail(id) {
  showView("detail");
  $("#detail-content").innerHTML = `<div style="text-align:center;padding:48px 0;color:var(--text-3);font-size:14px">Cargando ruta...</div>`;
  try {
    state.currentRoute = await api("GET", `/routes/${id}`);
    renderDetail();
  } catch (err) {
    $("#detail-content").innerHTML = `<div style="color:var(--danger);padding:20px;font-size:14px">Error: ${esc(err.message)}</div>`;
  }
}

function renderDetail() {
  const r = state.currentRoute;
  if (!r) return;

  const visited  = r.stops.filter(s => s.status === "visited").length;
  const skipped  = r.stops.filter(s => s.status === "skipped").length;
  const failed   = r.stops.filter(s => s.status === "failed").length;
  const total    = r.stops.length;
  const done     = visited + skipped + failed;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;

  const isPending  = ["pending","draft"].includes(r.status);
  const isActive   = ["in_progress","active"].includes(r.status);
  const isPaused   = r.status === "paused";
  const isFinished = ["completed","cancelled"].includes(r.status);

  // Action buttons
  let actionBtns = "";
  if (isPending) {
    actionBtns = `
      <div class="detail-actions has-2">
        <button class="btn-primary" id="btn-start" style="grid-column:span 1">
          <span>▶</span> Iniciar ruta
        </button>
        <button class="btn-secondary" id="btn-maps">🗺 Ver mapa</button>
      </div>
      <div class="detail-actions has-1">
        <button class="btn-danger" id="btn-cancel">Cancelar ruta</button>
      </div>
    `;
  } else if (isActive) {
    actionBtns = `
      <div class="detail-actions has-3">
        <button class="btn-secondary" id="btn-pause">⏸ Pausar</button>
        <button class="btn-secondary" id="btn-maps">🗺 Mapa</button>
        <button class="btn-primary"   id="btn-complete">✓ Finalizar</button>
      </div>
    `;
  } else if (isPaused) {
    actionBtns = `
      <div class="detail-actions has-2">
        <button class="btn-primary"  id="btn-resume">▶ Reanudar</button>
        <button class="btn-secondary" id="btn-maps">🗺 Mapa</button>
      </div>
      <div class="detail-actions has-1">
        <button class="btn-danger" id="btn-cancel">Cancelar ruta</button>
      </div>
    `;
  } else {
    actionBtns = `
      <div class="detail-actions has-1">
        <button class="btn-secondary" id="btn-maps">🗺 Ver itinerario completo</button>
      </div>
    `;
  }

  const stopsHtml = r.stops.map(s => stopHtml(s, r.status)).join("");

  $("#detail-content").innerHTML = `
    <div class="detail-header">
      <span class="pill pill-${r.status}">${statusLabel(r.status)}</span>
      <h1 class="detail-title">${esc(r.name)}</h1>
      <p class="detail-meta">Creada ${fmtDate(r.created_at)} · Salida: ${esc(truncate(r.start_address, 42))}</p>
    </div>

    <div class="map-container">
      <div id="map"></div>
      <div class="map-fallback hidden" id="map-fallback">
        <div class="map-fallback-icon">🗺</div>
        <span id="map-fallback-msg">Mapa no disponible</span>
      </div>
    </div>

    <div class="detail-progress-section">
      <div class="detail-progress-row">
        <span class="detail-progress-label">Progreso</span>
        <span class="detail-progress-count">${done} de ${total} paradas · ${pct}%</span>
      </div>
      <div class="detail-progress-bar-track">
        <div class="detail-progress-bar-fill" style="width:${pct}%"></div>
      </div>
      ${done > 0 ? `
        <div style="display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--text-3)">
          ${visited > 0  ? `<span style="color:var(--success)">✓ ${visited} visitada${visited!==1?"s":""}</span>` : ""}
          ${skipped > 0  ? `<span style="color:var(--warning)">⤳ ${skipped} omitida${skipped!==1?"s":""}</span>` : ""}
          ${failed > 0   ? `<span style="color:var(--danger)">✗ ${failed} fallida${failed!==1?"s":""}</span>` : ""}
        </div>
      ` : ""}
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <span class="stat-label">Distancia</span>
        <span class="stat-value">${fmtDist(r.total_distance_km)}</span>
      </div>
      <div class="detail-stat">
        <span class="stat-label">Duración est.</span>
        <span class="stat-value">${fmtMin(r.estimated_time_minutes)}</span>
      </div>
      <div class="detail-stat">
        <span class="stat-label">Velocidad</span>
        <span class="stat-value">${fmtSpeed(r.average_speed_kmh)}</span>
      </div>
    </div>

    ${actionBtns}

    ${r.notes ? `<div style="background:var(--surface);border:1.5px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--r-lg);padding:12px 14px;font-size:13px;color:var(--text-2);margin-bottom:16px;font-style:italic">${esc(r.notes)}</div>` : ""}

    <p class="stops-section-title">Paradas · ${total}</p>
    <ol class="stops-display">${stopsHtml}</ol>
  `;

  bindDetailActions(r);
  renderMap(r);
}

function stopHtml(s, routeStatus) {
  const isActive = ["in_progress","active"].includes(routeStatus);
  const canAct   = isActive && s.status === "pending";
  const canReset = isActive && ["visited","skipped","failed"].includes(s.status);
  const virtual  = isVirtualAddress(s.address);

  const navRow = virtual
    ? `<span class="stop-virtual-badge">Sin dirección física</span>`
    : `<div class="stop-nav-row">
        <button class="nav-btn" onclick="openNav('google',${s.lat},${s.lng})" type="button">
          <span class="nav-icon google">G</span> Maps
        </button>
        <button class="nav-btn" onclick="openNav('waze',${s.lat},${s.lng})" type="button">
          <span class="nav-icon waze">W</span> Waze
        </button>
        <button class="nav-btn" onclick="openNav('apple',${s.lat},${s.lng})" type="button">
          <span class="nav-icon apple">A</span> Apple
        </button>
      </div>`;

  const actRow = (canAct || canReset) ? `
    <div class="stop-actions-row">
      ${canAct ? `
        <button class="stop-act-btn visit" data-action="visited">
          <span class="act-icon">✓</span> Visitada
        </button>
        <button class="stop-act-btn skip" data-action="skipped">
          <span class="act-icon">⤳</span> Omitida
        </button>
        <button class="stop-act-btn fail" data-action="failed">
          <span class="act-icon">✗</span> Fallida
        </button>
      ` : `
        <button class="stop-act-btn reset" data-action="pending">
          <span class="act-icon">↺</span> Restablecer
        </button>
      `}
    </div>
  ` : "";

  return `
    <li class="stop-item is-${s.status}" data-stop-id="${s.id}">
      <div class="stop-main">
        <div class="stop-num-badge">${s.order || "—"}</div>
        <div class="stop-body">
          ${s.label ? `<p class="stop-label">${esc(s.label)}</p>` : ""}
          <p class="stop-address">${esc(s.address)}</p>
          <div class="stop-meta-row">
            <span class="stop-distance">${fmtDist(s.distance_from_previous_km)} desde anterior</span>
            <span class="stop-status-tag is-${s.status}">${stopStatusLabel(s.status)}</span>
          </div>
          ${navRow}
        </div>
      </div>
      ${actRow}
    </li>
  `;
}

function bindDetailActions(r) {
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  on("#btn-start",    () => updateRouteStatus("in_progress"));
  on("#btn-resume",   () => updateRouteStatus("in_progress"));
  on("#btn-pause",    () => updateRouteStatus("paused"));
  on("#btn-complete", () => { if (confirm("¿Finalizar la ruta? Las paradas pendientes quedarán omitidas.")) updateRouteStatus("completed"); });
  on("#btn-cancel",   () => { if (confirm("¿Cancelar esta ruta?")) updateRouteStatus("cancelled"); });
  on("#btn-maps",     () => openFullRouteInMaps(r));

  $$(".stop-act-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const li = e.currentTarget.closest("[data-stop-id]");
      updateStop(li.dataset.stopId, e.currentTarget.dataset.action);
    });
  });
}

async function updateRouteStatus(status) {
  showLoader("Actualizando...");
  try {
    state.currentRoute = await api("PATCH", `/routes/${state.currentRoute.id}/status`, { status });
    renderDetail();
    toast("Estado actualizado");
  } catch (err) {
    toast(err.message, "error");
  } finally { hideLoader(); }
}

async function updateStop(stopId, status) {
  try {
    state.currentRoute = await api("PATCH", `/routes/${state.currentRoute.id}/stops/${stopId}`, { status });
    renderDetail();
    renderMap(state.currentRoute);
  } catch (err) { toast(err.message, "error"); }
}

// ─── Navigation deep links ────────────────────────────────────────────────────
function openNav(provider, lat, lng) {
  if (!lat || !lng) { toast("Esta parada no tiene coordenadas", "warn"); return; }
  const ll = `${lat},${lng}`;
  const ua = navigator.userAgent;
  const isIOS     = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMobile  = isIOS || isAndroid;

  let appUrl, webUrl;

  if (provider === 'google') {
    webUrl = `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
    appUrl = isIOS     ? `comgooglemaps://?daddr=${ll}&directionsmode=driving`
           : isAndroid ? `intent://maps.google.com/maps?daddr=${ll}#Intent;scheme=https;package=com.google.android.apps.maps;end`
           : null;
  } else if (provider === 'waze') {
    webUrl = `https://waze.com/ul?ll=${ll}&navigate=yes&zoom=17`;
    appUrl = (isIOS || isAndroid) ? `waze://ul?ll=${ll}&navigate=yes` : null;
  } else if (provider === 'apple') {
    webUrl = `https://maps.apple.com/?daddr=${ll}`;
    appUrl = isIOS ? `maps://?daddr=${ll}&dirflg=d` : null;
  }

  if (appUrl) {
    // Try native app; if not installed fall back to web after 1.5s
    let opened = false;
    const fallback = setTimeout(() => {
      if (!opened) window.open(webUrl, '_blank', 'noopener');
    }, 1500);
    document.addEventListener('visibilitychange', function h() {
      if (document.hidden) { opened = true; clearTimeout(fallback); }
      document.removeEventListener('visibilitychange', h);
    });
    window.location.href = appUrl;
  } else {
    window.open(webUrl, '_blank', 'noopener');
  }
}

function openFullRouteInMaps(route) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const stops = route.stops.filter(s => s.lat && s.lng && !isVirtualAddress(s.address));
  const start = `${route.start_lat},${route.start_lng}`;
  if (!stops.length) { toast("Sin paradas con dirección física", "warn"); return; }
  if (isIOS) {
    window.location.href = `maps://?saddr=${start}&daddr=${stops[stops.length-1].lat},${stops[stops.length-1].lng}&dirflg=d`;
  } else {
    const wp = stops.map(s => `${s.lat},${s.lng}`);
    const dest = wp.pop();
    const params = new URLSearchParams({ api:"1", origin: start, destination: dest, travelmode:"driving" });
    if (wp.length > 0) params.set("waypoints", wp.slice(0, 8).join("|"));
    window.location.href = `https://www.google.com/maps/dir/?${params}`;
  }
}

// ─── Mapbox GL ────────────────────────────────────────────────────────────────
function destroyMap() {
  if (state.map) { try { state.map.remove(); } catch {} state.map = null; }
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
  _mapboxLoading = new Promise(resolve => {
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
  if (!cfg?.mapbox_public_token) { showMapFallback("Configura MAPBOX_PUBLIC_TOKEN para el mapa"); return; }
  const ok = await ensureMapboxLoaded();
  if (!ok || !window.mapboxgl) { showMapFallback("No se pudo cargar Mapbox"); return; }
  if (route.start_lat == null) { showMapFallback("Faltan coordenadas"); return; }

  window.mapboxgl.accessToken = cfg.mapbox_public_token;
  const container = document.getElementById("map");
  if (!container) return;

  const start = [route.start_lng, route.start_lat];
  const stops = route.stops.filter(s => s.lat != null && s.lng != null).map(s => [s.lng, s.lat]);
  const all = [start, ...stops];
  if (route.return_to_start) all.push(start);

  const map = new window.mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    bounds: bboxOf(all),
    fitBoundsOptions: { padding: 32, maxZoom: 14 },
    attributionControl: false,
  });
  state.map = map;

  map.addControl(new window.mapboxgl.AttributionControl({ compact: true }));
  map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
    map.addSource("route-line", {
      type: "geojson",
      data: { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: all } },
    });
    map.addLayer({
      id: "route-line", type: "line", source: "route-line",
      layout: { "line-join":"round", "line-cap":"round" },
      paint: { "line-color":"#65a30d", "line-width":3, "line-opacity":0.8 },
    });
    addMarker(map, start, "INICIO", "start", route.start_address);
    route.stops.forEach(s => {
      if (s.lat == null) return;
      const cls = { visited:"visited", skipped:"skipped", failed:"failed" }[s.status] || "";
      addMarker(map, [s.lng, s.lat], String(s.order || "?"), cls, s.label || s.address);
    });
  });
  map.on("error", () => showMapFallback("Error del mapa"));
}

function addMarker(map, lngLat, label, kind, popup) {
  const el = document.createElement("div");
  el.className = "map-marker " + (kind || "");
  el.textContent = label;
  const m = new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat);
  if (popup) m.setPopup(new window.mapboxgl.Popup({ offset: 20, closeButton: false }).setText(popup));
  m.addTo(map);
  state.mapMarkers.push(m);
}

function bboxOf(coords) {
  let [mLng, mLat, xLng, xLat] = [+Infinity, +Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of coords) {
    if (lng < mLng) mLng = lng; if (lng > xLng) xLng = lng;
    if (lat < mLat) mLat = lat; if (lat > xLat) xLat = lat;
  }
  return [[mLng, mLat], [xLng, xLat]];
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function openSettings() {
  const s = Settings.get();
  $("#s-home").value = s.home_address || "";
  setStatusPill("status-home", "", "");
  $$(".unit-btn[data-unit-modal]").forEach(b => b.classList.toggle("is-active", b.dataset.unitModal === s.units));
  $("#settings-modal").classList.remove("hidden");
  if (s.home_address) {
    setStatusPill("status-home", "loading", "...");
    tryGeocode(s.home_address).then(r => paintGeoStatus("status-home", r));
  }
}
function closeSettings() { $("#settings-modal").classList.add("hidden"); }

function bindSettingsModal() {
  $("#btn-settings").addEventListener("click", openSettings);
  $$("[data-close-modal]").forEach(el => el.addEventListener("click", closeSettings));

  let t = null;
  $("#s-home").addEventListener("blur", () => {
    clearTimeout(t);
    const v = $("#s-home").value.trim();
    if (v.length < 5) { setStatusPill("status-home", "", ""); return; }
    setStatusPill("status-home", "loading", "...");
    t = setTimeout(async () => paintGeoStatus("status-home", await tryGeocode(v)), 400);
  });

  $$(".unit-btn[data-unit-modal]").forEach(b => {
    b.addEventListener("click", () => {
      $$(".unit-btn[data-unit-modal]").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
    });
  });

  $("#btn-save-settings").addEventListener("click", () => {
    const home = $("#s-home").value.trim();
    const u = document.querySelector(".unit-btn[data-unit-modal].is-active")?.dataset.unitModal || "km";
    Settings.save({ home_address: home, units: u });
    syncUnitTopbar();
    updateSpeedFieldUnit();
    closeSettings();
    toast("Ajustes guardados ✓");
    if (state.view === "list") renderRoutes();
    else if (state.view === "detail" && state.currentRoute) renderDetail();
    else if (state.view === "create") prefillCreateForm();
  });
}

// ─── Unit toggle (topbar) ─────────────────────────────────────────────────────
function bindTopbarUnits() {
  $$(".unit-toggle .unit-btn[data-unit]").forEach(b => {
    b.addEventListener("click", () => {
      const u = b.dataset.unit;
      $$(".unit-toggle .unit-btn[data-unit]").forEach(x => x.classList.toggle("is-active", x.dataset.unit === u));
      Settings.save({ units: u });
      if (state.view === "list") renderRoutes();
      else if (state.view === "detail" && state.currentRoute) renderDetail();
      updateSpeedFieldUnit();
    });
  });
}

function syncUnitTopbar() {
  const u = Settings.get().units;
  $$(".unit-toggle .unit-btn[data-unit]").forEach(b => b.classList.toggle("is-active", b.dataset.unit === u));
}

function updateSpeedFieldUnit() {
  const lbl = document.querySelector(".speed-unit");
  const spd = $("#f-speed");
  if (!lbl || !spd) return;
  const u = units();
  const cur = parseFloat(spd.value);
  const wasMi = lbl.textContent.includes("mph");
  if (!isNaN(cur) && wasMi !== (u === "mi")) {
    spd.value = u === "mi" ? (cur * KM_TO_MI).toFixed(0) : (cur / KM_TO_MI).toFixed(0);
  }
  lbl.textContent = `(${speedLabel()})`;
}

// ─── Global bindings ──────────────────────────────────────────────────────────
function bindGlobal() {
  $$(".tab").forEach(t => t.dataset.view && t.addEventListener("click", () => showView(t.dataset.view)));
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

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  Settings.load();
  syncUnitTopbar();
  updateSpeedFieldUnit();
  bindGlobal();
  loadRoutes();
  loadServerConfig();
});
