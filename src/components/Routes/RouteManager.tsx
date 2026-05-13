import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Loader2, MapPin, Navigation, Play, Route,
  SkipForward, Trash2, XCircle, Zap
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationOption {
  name: string;
  total: number;
  withAddress: number;
}

interface RouteStop {
  id: string;
  order_index: number;
  address: string;
  lat: number | null;
  lng: number | null;
  label: string | null;
  distance_from_previous_km: number;
  status: 'pending' | 'visited' | 'skipped' | 'failed';
  visited_at: string | null;
  notes: string | null;
  company_id: string | null;
  company_name: string | null;
  company_phone: string | null;
}

interface RouteItem {
  id: string;
  name: string;
  start_address: string;
  start_lat: number | null;
  start_lng: number | null;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  total_distance_km: number | null;
  estimated_time_minutes: number | null;
  created_at: string;
  stops_count: number;
  visited_stops: number;
  skipped_stops: number;
  failed_stops: number;
  stops?: RouteStop[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${r.status}`);
  }
  return r.json();
};

const statusColor: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-lime-100 text-lime-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
};

const stopStatusColor: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  visited: 'bg-green-100 text-green-700',
  skipped: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-600',
};

const statusLabel: Record<string, string> = {
  draft: 'Draft', active: 'Active', paused: 'Paused',
  completed: 'Completed', cancelled: 'Cancelled',
};

const stopStatusLabel: Record<string, string> = {
  pending: 'Pending', visited: 'Visited', skipped: 'Skipped', failed: 'Failed',
};

const fmtMin = (m: number | null) => {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

const navUrl = (address: string, lat: number | null, lng: number | null) => {
  if (lat && lng) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

const wazeUrl = (lat: number | null, lng: number | null, address: string) => {
  if (lat && lng) return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(address)}`;
};

// ─── Static map using Mapbox Static Images API ────────────────────────────────

const StaticRouteMap: React.FC<{ stops: RouteStop[]; token: string }> = ({ stops, token }) => {
  const stopsWithCoords = stops.filter(s => s.lat && s.lng);
  if (stopsWithCoords.length === 0 || !token) return null;

  const markers = stopsWithCoords.slice(0, 25).map((s, i) => {
    const color = s.status === 'visited' ? '16a34a' : s.status === 'skipped' ? 'f59e0b' : s.status === 'failed' ? 'ef4444' : '6366f1';
    return `pin-s-${i + 1}+${color}(${s.lng},${s.lat})`;
  });

  // Build path overlay
  const pathCoords = stopsWithCoords.slice(0, 25).map(s => `${s.lng},${s.lat}`).join(',');
  const path = stopsWithCoords.length > 1 ? `path+4f46e5-0.6(${encodeURIComponent(pathCoords)})` : '';

  const overlays = [...markers, path].filter(Boolean).join(',');
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays}/auto/700x320?padding=40&access_token=${token}`;

  return (
    <img
      src={url}
      alt="Route map"
      className="w-full rounded-xl border border-slate-200 object-cover"
      style={{ maxHeight: 320 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
};

// ─── Route Detail View ────────────────────────────────────────────────────────

const RouteDetail: React.FC<{
  route: RouteItem;
  mapboxToken: string;
  onBack: () => void;
  onStatusChange: (routeId: string, status: string) => void;
}> = ({ route, mapboxToken, onBack, onStatusChange }) => {
  const [stops, setStops] = useState<RouteStop[]>(route.stops || []);
  const [loading, setLoading] = useState(!route.stops);
  const [updatingStop, setUpdatingStop] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!route.stops) {
      setLoading(true);
      api(`/api/routes/${route.id}`)
        .then(data => setStops(data.stops || []))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setStops(route.stops);
      setLoading(false);
    }
  }, [route.id, route.stops]);

  const markStop = async (stopId: string, status: 'visited' | 'skipped' | 'failed' | 'pending') => {
    setUpdatingStop(stopId);
    try {
      const updated = await api(`/api/routes/${route.id}/stops/${stopId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setStops(prev => prev.map(s => s.id === stopId ? { ...s, ...updated } : s));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUpdatingStop(null);
    }
  };

  const changeRouteStatus = async (newStatus: string) => {
    setStatusUpdating(true);
    try {
      await api(`/api/routes/${route.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      onStatusChange(route.id, newStatus);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setStatusUpdating(false);
    }
  };

  const pendingCount = stops.filter(s => s.status === 'pending').length;
  const visitedCount = stops.filter(s => s.status === 'visited').length;
  const progress = stops.length > 0 ? Math.round((visitedCount / stops.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-900 truncate">{route.name}</h2>
          <p className="text-sm text-slate-500 truncate">{route.start_address}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${statusColor[route.status]}`}>
          {statusLabel[route.status]}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Stops', value: stops.length },
          { label: 'Visited', value: visitedCount },
          { label: 'Distance', value: route.total_distance_km ? `${route.total_distance_km} km` : '—' },
          { label: 'Est. time', value: fmtMin(route.estimated_time_minutes) },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {stops.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-600">Progress</span>
            <span className="font-semibold text-slate-900">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-lime-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="text-green-600">{visitedCount} visited</span>
            <span className="text-amber-600">{stops.filter(s => s.status === 'skipped').length} skipped</span>
            <span className="text-slate-500">{pendingCount} pending</span>
          </div>
        </div>
      )}

      {/* Map */}
      {stops.length > 0 && mapboxToken && (
        <StaticRouteMap stops={stops} token={mapboxToken} />
      )}

      {/* Route actions */}
      <div className="flex gap-2 flex-wrap">
        {route.status === 'draft' && (
          <button
            onClick={() => changeRouteStatus('active')}
            disabled={statusUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 disabled:opacity-50 transition-colors"
          >
            <Play className="w-4 h-4" /> Start route
          </button>
        )}
        {route.status === 'active' && (
          <>
            <button
              onClick={() => changeRouteStatus('paused')}
              disabled={statusUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={() => changeRouteStatus('completed')}
              disabled={statusUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> Complete
            </button>
          </>
        )}
        {route.status === 'paused' && (
          <button
            onClick={() => changeRouteStatus('active')}
            disabled={statusUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 disabled:opacity-50 transition-colors"
          >
            <Play className="w-4 h-4" /> Resume
          </button>
        )}
        {statusUpdating && <Loader2 className="w-5 h-5 animate-spin text-slate-400 self-center" />}
      </div>

      {/* Stop list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {stops.map((stop, idx) => (
            <div
              key={stop.id}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${
                stop.status === 'visited' ? 'border-green-200 bg-green-50/30' :
                stop.status === 'skipped' ? 'border-amber-200 bg-amber-50/30' :
                stop.status === 'failed' ? 'border-red-200 bg-red-50/30' :
                'border-slate-200'
              }`}
            >
              <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => setExpanded(expanded === stop.id ? null : stop.id)}
              >
                {/* Stop number */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  stop.status === 'visited' ? 'bg-green-500 text-white' :
                  stop.status === 'skipped' ? 'bg-amber-400 text-white' :
                  stop.status === 'failed' ? 'bg-red-500 text-white' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {stop.status === 'visited' ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate text-sm">{stop.label || stop.company_name || `Stop ${idx + 1}`}</p>
                  <p className="text-xs text-slate-500 truncate">{stop.address}</p>
                  {stop.distance_from_previous_km > 0 && (
                    <p className="text-xs text-slate-400">{stop.distance_from_previous_km} km from previous</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${stopStatusColor[stop.status]}`}>
                    {stopStatusLabel[stop.status]}
                  </span>
                  {expanded === stop.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {/* Expanded actions */}
              {expanded === stop.id && (
                <div className="px-3 pb-3 border-t border-slate-100 pt-3 space-y-3">
                  {stop.company_phone && (
                    <p className="text-sm text-slate-600">📞 {stop.company_phone}</p>
                  )}

                  {/* Navigation */}
                  <div className="flex gap-2">
                    <a
                      href={navUrl(stop.address, stop.lat, stop.lng)}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Google Maps
                    </a>
                    <a
                      href={wazeUrl(stop.lat, stop.lng, stop.address)}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-lg text-xs font-medium hover:bg-cyan-100 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Waze
                    </a>
                  </div>

                  {/* Mark stop */}
                  {stop.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => markStop(stop.id, 'visited')}
                        disabled={updatingStop === stop.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {updatingStop === stop.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Visited
                      </button>
                      <button
                        onClick={() => markStop(stop.id, 'skipped')}
                        disabled={updatingStop === stop.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200 disabled:opacity-50 transition-colors"
                      >
                        <SkipForward className="w-3.5 h-3.5" /> Skip
                      </button>
                      <button
                        onClick={() => markStop(stop.id, 'failed')}
                        disabled={updatingStop === stop.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </button>
                    </div>
                  )}
                  {stop.status !== 'pending' && (
                    <button
                      onClick={() => markStop(stop.id, 'pending')}
                      disabled={updatingStop === stop.id}
                      className="text-xs text-slate-500 hover:text-slate-700 underline"
                    >
                      Reset to pending
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Route Card ───────────────────────────────────────────────────────────────

const RouteCard: React.FC<{
  route: RouteItem;
  onView: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}> = ({ route, onView, onDelete, onStatusChange }) => {
  const progress = route.stops_count > 0
    ? Math.round((route.visited_stops / route.stops_count) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate text-sm">{route.name}</h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">{route.start_address}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusColor[route.status]}`}>
          {statusLabel[route.status]}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
        <span className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          {route.stops_count} stops
        </span>
        {route.total_distance_km && (
          <span>{route.total_distance_km} km</span>
        )}
        {route.estimated_time_minutes && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {fmtMin(route.estimated_time_minutes)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {route.stops_count > 0 && (
        <div className="mb-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-lime-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{route.visited_stops}/{route.stops_count} visited</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onView}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-100 transition-colors"
        >
          <Route className="w-3.5 h-3.5" /> View route
        </button>
        {route.status === 'draft' && (
          <button
            onClick={() => onStatusChange('active')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-lime-600 text-white rounded-lg text-xs font-medium hover:bg-lime-700 transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Start
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ─── Create Routes Form ───────────────────────────────────────────────────────

const CreateRoutesForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [region, setRegion] = useState<'ontario' | 'quebec'>('ontario');
  const [filterType, setFilterType] = useState<'city' | 'town'>('city');
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [towns, setTowns] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [stopsPerRoute, setStopsPerRoute] = useState(100);
  const [routePrefix, setRoutePrefix] = useState('Ruta');
  const [startAddress, setStartAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const loadLocations = useCallback(async () => {
    setLoadingLocations(true);
    setSelectedLocation('');
    try {
      const [cityData, townData] = await Promise.all([
        api(`/api/routes/cities?region=${region}`),
        api(`/api/routes/towns?region=${region}`),
      ]);
      setCities(cityData);
      setTowns(townData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingLocations(false);
    }
  }, [region]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const options = filterType === 'city' ? cities : towns;

  const handleCreate = async () => {
    if (!selectedLocation) return setError('Select a city or town.');
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const body: any = { region, stopsPerRoute, routePrefix };
      if (filterType === 'city') body.city = selectedLocation;
      else body.town = selectedLocation;
      if (startAddress.trim()) body.startAddress = startAddress.trim();

      const data = await api('/api/routes/create-batch', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult(data);
      if (data.routesCreated > 0) onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Create routes by location</h2>
        <p className="text-sm text-slate-500 mt-1">
          Selecciona una ciudad o pueblo y el sistema agrupará automáticamente las empresas más cercanas entre sí en rutas de hasta {stopsPerRoute} paradas.
        </p>
      </div>

      {/* Region */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Region</label>
        <div className="flex gap-2">
          {(['ontario', 'quebec'] as const).map(r => (
            <button
              key={r}
              onClick={() => { setRegion(r); setResult(null); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                region === r
                  ? 'border-lime-500 bg-lime-50 text-lime-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter type */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Filter by</label>
        <div className="flex gap-2">
          {[{ v: 'city', l: 'City' }, { v: 'town', l: 'Town/Municipality' }].map(opt => (
            <button
              key={opt.v}
              onClick={() => { setFilterType(opt.v as any); setSelectedLocation(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                filterType === opt.v
                  ? 'border-lime-500 bg-lime-50 text-lime-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* Location selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {filterType === 'city' ? 'City' : 'Town'} {loadingLocations && <Loader2 className="w-3.5 h-3.5 inline animate-spin ml-1" />}
        </label>
        <select
          value={selectedLocation}
          onChange={e => setSelectedLocation(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-lime-500"
          disabled={loadingLocations}
        >
          <option value="">— Select —</option>
          {options.map(opt => (
            <option key={opt.name} value={opt.name}>
                {opt.name} ({opt.withAddress} with address)
            </option>
          ))}
        </select>
      </div>

      {/* Stops per route */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Stops per route: <span className="text-lime-600 font-bold">{stopsPerRoute}</span>
        </label>
        <input
          type="range" min={20} max={150} step={10}
          value={stopsPerRoute}
          onChange={e => setStopsPerRoute(parseInt(e.target.value))}
          className="w-full accent-lime-600"
        />
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>20</span><span>150</span>
        </div>
      </div>

      {/* Starting address */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Starting address <span className="text-slate-400 font-normal">(your base / depot)</span>
        </label>
        <p className="text-xs text-slate-400 mb-2">
          The route will be optimized starting from here. If left empty, the center of the selected area will be used.
        </p>
        <input
          type="text"
          value={startAddress}
          onChange={e => setStartAddress(e.target.value)}
          placeholder="Eg: 20 Wellington St E, Toronto, ON"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
        />
      </div>

      {/* Route prefix */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Name prefix</label>
        <input
          type="text"
          value={routePrefix}
          onChange={e => setRoutePrefix(e.target.value)}
          placeholder="Route"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-lime-50 border border-lime-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-lime-600" />
            <span className="font-semibold text-lime-800">Routes created!</span>
          </div>
          <p className="text-sm text-lime-700">
            <strong>{result.routesCreated}</strong> rutas creadas para <strong>{result.location}</strong> con{' '}
            <strong>{result.totalCompanies}</strong> empresas en total.
          </p>
          {result.routes && result.routes.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {result.routes.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs text-lime-800 bg-lime-100 rounded-lg px-3 py-2">
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="shrink-0 ml-2">{r.stops} stops · {r.totalDistanceKm} km</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={loading || !selectedLocation}
        className="w-full flex items-center justify-center gap-2 py-3 bg-lime-600 text-white rounded-xl font-semibold text-sm hover:bg-lime-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Creating routes...</>
        ) : (
          <><Zap className="w-4 h-4" /> Create routes automatically</>
        )}
      </button>
    </div>
  );
};

// ─── Main RouteManager ────────────────────────────────────────────────────────

export const RouteManager: React.FC = () => {
  const [tab, setTab] = useState<'list' | 'create'>('list');
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const listRef = useRef<string>('');

  const loadRoutes = useCallback(async (filter = statusFilter) => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const data = await api(`/api/routes${params}`);
      setRoutes(data.items || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadRoutes(statusFilter); }, [statusFilter]);

  useEffect(() => {
    api('/api/config/mapbox').then(d => setMapboxToken(d.token || '')).catch(() => {});
  }, []);

  const handleStatusFilter = (s: string) => {
    setStatusFilter(s);
    listRef.current = s;
  };

  const handleDelete = async (routeId: string) => {
    if (!confirm('Delete this route?')) return;
    try {
      await api(`/api/routes/${routeId}`, { method: 'DELETE' });
      setRoutes(prev => prev.filter(r => r.id !== routeId));
      if (selectedRoute?.id === routeId) setSelectedRoute(null);
    } catch (e: any) { alert(e.message); }
  };

  const handleStatusChange = async (routeId: string, status: string) => {
    try {
      await api(`/api/routes/${routeId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, status: status as any } : r));
      if (selectedRoute?.id === routeId) setSelectedRoute(prev => prev ? { ...prev, status: status as any } : null);
    } catch (e: any) { alert(e.message); }
  };

  const viewRoute = async (route: RouteItem) => {
    // Load full route detail with stops
    try {
      const data = await api(`/api/routes/${route.id}`);
      setSelectedRoute({ ...route, stops: data.stops });
    } catch {
      setSelectedRoute(route);
    }
  };

  const filterTabs = [
    { v: 'all', l: 'All' },
    { v: 'draft', l: 'Draft' },
    { v: 'active', l: 'Active' },
    { v: 'paused', l: 'Paused' },
    { v: 'completed', l: 'Completed' },
  ];

  if (selectedRoute) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <RouteDetail
          route={selectedRoute}
          mapboxToken={mapboxToken}
          onBack={() => { setSelectedRoute(null); loadRoutes(statusFilter); }}
          onStatusChange={handleStatusChange}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visit routes</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and optimize company visit routes</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'list' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            My routes
          </button>
          <button
            onClick={() => setTab('create')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'create' ? 'bg-lime-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            + Create routes
          </button>
        </div>
      </div>

      {tab === 'create' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <CreateRoutesForm onCreated={() => { setTab('list'); loadRoutes('all'); setStatusFilter('all'); }} />
        </div>
      ) : (
        <>
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {filterTabs.map(f => (
              <button
                key={f.v}
                onClick={() => handleStatusFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === f.v
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>

          {/* Routes grid */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : routes.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
              <Route className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No routes</p>
              <p className="text-slate-400 text-sm mt-1">Create automatic routes from "Create routes"</p>
              <button
                onClick={() => setTab('create')}
                className="mt-4 px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 transition-colors"
              >
                Create my first route
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {routes.map(route => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onView={() => viewRoute(route)}
                  onDelete={() => handleDelete(route.id)}
                  onStatusChange={(status) => handleStatusChange(route.id, status)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
