import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MapPin, Play, RefreshCw } from 'lucide-react';

interface RegionStatus {
  region: string;
  total: number;
  con_coords: number;
  sin_coords: number;
}

interface GeoProgressEvent {
  type: string;
  region?: string;
  processed?: number;
  total?: number;
  updated?: number;
  failed?: number;
  pct?: number;
  totalProcessed?: number;
  totalUpdated?: number;
  totalFailed?: number;
}

export const GeocodingManager: React.FC = () => {
  const [status, setStatus] = useState<RegionStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [running, setRunning] = useState(false);
  const [region, setRegion] = useState<'ontario' | 'quebec' | 'both'>('both');
  const [batchSize, setBatchSize] = useState(50);
  const [progress, setProgress] = useState<GeoProgressEvent | null>(null);
  const [regionProgress, setRegionProgress] = useState<Record<string, GeoProgressEvent>>({});
  const [done, setDone] = useState<GeoProgressEvent | null>(null);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const r = await fetch('/api/geocoding/status', { credentials: 'include' });
      const data = await r.json();
      setStatus(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runGeocoding = async () => {
    setRunning(true);
    setProgress(null);
    setRegionProgress({});
    setDone(null);
    setError('');

    try {
      const r = await fetch('/api/geocoding/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ region, batchSize }),
      });

      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || `HTTP ${r.status}`);
      }

      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: GeoProgressEvent = JSON.parse(line.slice(6));
                if (event.type === 'progress') {
                  setProgress(event);
                  setRegionProgress(prev => ({ ...prev, [event.region!]: event }));
                } else if (event.type === 'done') {
                  setDone(event);
                  loadStatus();
                }
              } catch (_e) {}
            }
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const totalNeed = status.reduce((s, r) => s + r.sin_coords, 0);
  const totalHave = status.reduce((s, r) => s + r.con_coords, 0);
  const totalAll = status.reduce((s, r) => s + r.total, 0);
  const pctDone = totalAll > 0 ? Math.round((totalHave / totalAll) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Bulk geocoding</h2>
        <p className="text-sm text-slate-500 mt-1">
          Convierte las direcciones de las empresas en coordenadas GPS usando Mapbox.
          Las coordenadas son necesarias para crear rutas optimizadas.
        </p>
      </div>

      {/* Current status */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Estado actual</h3>
          <button
            onClick={loadStatus}
            disabled={loadingStatus}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingStatus ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Overall progress */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-600">Total progress</span>
                <span className="font-semibold text-slate-900">{totalHave.toLocaleString()} / {totalAll.toLocaleString()} ({pctDone}%)</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-lime-500 rounded-full transition-all duration-500"
                  style={{ width: `${pctDone}%` }}
                />
              </div>
            </div>

            {/* Per-region breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {status.map(r => {
                const pct = r.total > 0 ? Math.round((r.con_coords / r.total) * 100) : 0;
                return (
                  <div key={r.region} className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-800 capitalize">{r.region}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        pct === 100 ? 'bg-green-100 text-green-700' :
                        pct > 50 ? 'bg-lime-100 text-lime-700' :
                        pct > 0 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-600'
                      }`}>{pct}% ready</span>
                    </div>
                    <div className="h-1.5 bg-white rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-lime-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span className="text-green-600">{r.con_coords.toLocaleString()} with coords</span>
                      <span className="text-amber-600">{r.sin_coords.toLocaleString()} pending</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalNeed === 0 && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 font-medium">All companies already have coordinates! You can create routes.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Run geocoding */}
      {totalNeed > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">Run geocoding</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Region</label>
              <select
                value={region}
                onChange={e => setRegion(e.target.value as any)}
                disabled={running}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
              >
                <option value="both">Both (Ontario + Quebec)</option>
                <option value="ontario">Ontario only</option>
                <option value="quebec">Quebec only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Batch: <span className="text-lime-600 font-bold">{batchSize}</span> / min
              </label>
              <input
                type="range" min={10} max={100} step={10}
                value={batchSize}
                disabled={running}
                onChange={e => setBatchSize(parseInt(e.target.value))}
                className="w-full mt-1 accent-lime-600"
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <strong>{totalNeed.toLocaleString()}</strong> companies to geocode.
            {totalNeed > 1000 && ` Tiempo estimado: ~${Math.ceil(totalNeed / batchSize * 0.2 / 60)} minutos.`}
            <span className="block mt-1 text-xs text-amber-600">Uses the Mapbox API (free tier: 100,000/month).</span>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Live progress */}
          {running && (
            <div className="space-y-3">
              {Object.values(regionProgress).map((rp: GeoProgressEvent) => (
                <div key={rp.region} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700 capitalize">{rp.region}</span>
                    <span className="text-slate-600">{rp.processed?.toLocaleString()} / {rp.total?.toLocaleString()} ({rp.pct}%)</span>
                  </div>
                  <div className="h-2 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-lime-500 rounded-full transition-all duration-300"
                      style={{ width: `${rp.pct || 0}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                    <span className="text-green-600">{rp.updated?.toLocaleString()} geocoded</span>
                    <span className="text-red-500">{rp.failed?.toLocaleString()} failed</span>
                  </div>
                </div>
              ))}
              {!Object.keys(regionProgress).length && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting geocoding...
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="flex items-start gap-2 p-4 bg-lime-50 border border-lime-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-lime-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-lime-800">Geocoding completed!</p>
                <p className="text-sm text-lime-700 mt-0.5">
                  {done.totalUpdated?.toLocaleString()} companies geocoded successfully · {done.totalFailed?.toLocaleString()} failed
                </p>
              </div>
            </div>
          )}

          <button
            onClick={runGeocoding}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 py-3 bg-lime-600 text-white rounded-xl font-semibold text-sm hover:bg-lime-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Geocoding...</>
            ) : (
              <><Play className="w-4 h-4" /> Start geocoding ({totalNeed.toLocaleString()} companies)</>
            )}
          </button>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1.5">
        <p className="font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4" /> How it works</p>
        <ul className="space-y-1 text-blue-700 ml-5 list-disc">
          <li>Se usa la API de Mapbox Geocoding para convertir cada dirección en lat/lng</li>
          <li>Los resultados se guardan en la base de datos permanentemente</li>
          <li>Solo procesa empresas que aún no tienen coordenadas</li>
          <li>Plan gratuito de Mapbox: 100,000 solicitudes/mes</li>
          <li>Puedes pausar y reanudar — solo procesa las que faltan</li>
        </ul>
      </div>
    </div>
  );
};
