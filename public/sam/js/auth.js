// auth.js — Servicio de autenticación para SAM
const AuthService = (() => {
const API_BASE = ''; // mismo dominio -> cookies funcionan

  let currentAccessToken = null;

async function login(usuario, password) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Error de autenticación');
  currentAccessToken = data.data.accessToken;  // guardar token
  return data;
}

// Modificar getProfile para usar el token en header si la cookie falla
async function getProfile() {
  const headers = {};
  if (currentAccessToken) {
    headers['Authorization'] = `Bearer ${currentAccessToken}`;
  }
  const res = await fetch(`${API_BASE}/api/v1/auth/perfil`, {
    headers,
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Sesión no válida');
  return await res.json();
}
  async function register(userData) {
    const res = await fetch(`${API_BASE}/api/v1/auth/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error en registro');
    return data;
  }

  async function logout() {
    const res = await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Error al cerrar sesión');
    return await res.json();
  }

  return { getProfile, login, register, logout };
})();