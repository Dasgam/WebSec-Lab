export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

function authHeaders() {
  const token = localStorage.getItem('webseclab_token');
  return token ? { Authorization: `Token ${token}` } : {};
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Ошибка API');
  return data;
}


export async function healthApi() {
  const base = API_BASE.replace(/\/api\/?$/, '');
  const response = await fetch(`${base}/health`, { cache: 'no-store' });
  return parseResponse(response);
}

export async function analyzeHttpUrl(url, timeout = 12) {
  const response = await fetch(`${API_BASE}/analyze/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ url, timeout }),
  });
  return parseResponse(response);
}

export async function fetchLabs() {
  const response = await fetch(`${API_BASE}/labs/`);
  return parseResponse(response);
}

export async function fetchLab(labId) {
  const response = await fetch(`${API_BASE}/labs/${labId}/`);
  return parseResponse(response);
}

export async function fetchProgress() {
  const response = await fetch(`${API_BASE}/progress/`, { headers: authHeaders() });
  return parseResponse(response);
}

export async function checkLabApi(labId, answer, hintsUsed = 0) {
  const response = await fetch(`${API_BASE}/labs/${labId}/check/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ answer, hints_used: hintsUsed }),
  });
  return parseResponse(response);
}

export async function completeLabApi(labId) {
  const response = await fetch(`${API_BASE}/labs/${labId}/complete/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return parseResponse(response);
}

export async function loginApi(username, password) {
  const response = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return parseResponse(response);
}

export async function registerApi(username, email, password) {
  const response = await fetch(`${API_BASE}/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  return parseResponse(response);
}

export async function meApi() {
  const response = await fetch(`${API_BASE}/auth/me/`, { headers: authHeaders() });
  return parseResponse(response);
}

export async function updateProfileApi(username, email) {
  const response = await fetch(`${API_BASE}/auth/profile/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username, email }),
  });
  return parseResponse(response);
}

export async function changePasswordApi(currentPassword, newPassword, confirmPassword) {
  const response = await fetch(`${API_BASE}/auth/change-password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword }),
  });
  return parseResponse(response);
}

export async function logoutApi() {
  const response = await fetch(`${API_BASE}/auth/logout/`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(response);
}

export async function startLabRuntimeApi(labId) {
  const response = await fetch(`${API_BASE}/runtime/${labId}/start/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return parseResponse(response);
}

export async function runtimeStatusApi(labId) {
  const response = await fetch(`${API_BASE}/runtime/${labId}/status/`, { headers: authHeaders() });
  return parseResponse(response);
}

export async function stopLabRuntimeApi(labId) {
  const response = await fetch(`${API_BASE}/runtime/${labId}/stop/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return parseResponse(response);
}
