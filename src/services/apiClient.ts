/**
 * Wrapper around fetch that automatically sends cookies (httpOnly auth_token)
 * with every request. The JWT is managed by the browser — never read by JS.
 */
export async function api(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // send httpOnly cookie on every request
  });
}

export async function apiJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await api(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}
