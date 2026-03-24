import { getStoredToken } from '../contexts/AuthContext';

/**
 * Wrapper de fetch que añade automáticamente el token JWT en todas las peticiones.
 * Usa esta función en lugar de fetch() directamente para llamar a la API.
 */
export async function api(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(url, { ...options, headers });
}

export async function apiJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await api(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data as T;
}
