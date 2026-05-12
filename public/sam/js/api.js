const ApiClient = (() => {
  async function request(url, options = {}) {
    const defaults = {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
    const merged = { ...defaults, ...options };
    const res = await fetch(url, merged);
    if (res.status === 401) {
      window.location.href = '/sam';
      throw new Error('Sesión expirada');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error del servidor');
    return data;
  }
  return { request };
})();