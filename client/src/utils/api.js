const TOKEN_KEY = 'bhel_auth_token';
const USER_KEY = 'bhel_auth_user';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
  getUser: () => {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clearUser: () => localStorage.removeItem(USER_KEY)
};

export async function apiRequest(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    authStorage.clearToken();
    authStorage.clearUser();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  return response;
}

function extractErrorMessage(res, data) {
  if (data && (data.error || data.message)) {
    return data.error || data.message;
  }
  if (res.status === 400) return 'Invalid request parameters or missing required fields.';
  if (res.status === 401) return 'Unauthorized: Invalid credentials or session expired.';
  if (res.status === 403) return 'Access denied: You do not have permission for this operation.';
  if (res.status === 404) return 'Resource or API endpoint not found (HTTP 404).';
  if (res.status === 409) return data?.message || 'Request conflict: Resource state or capacity limit exceeded.';
  if (res.status === 500) return 'Internal server error (HTTP 500). Please check backend server status.';
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return 'Backend server is unreachable. Please verify server process on port 5000.';
  }
  return `Server responded with HTTP ${res.status}.`;
}

export const api = {
  get: async (endpoint) => {
    try {
      const res = await apiRequest(endpoint, { method: 'GET' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw { status: res.status, data, message: extractErrorMessage(res, data) };
      }
      return data;
    } catch (err) {
      if (err.status !== undefined) throw err;
      throw { status: 0, message: 'Network connection failed. Unable to reach server at port 5000.' };
    }
  },

  post: async (endpoint, body) => {
    try {
      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw { status: res.status, data, message: extractErrorMessage(res, data) };
      }
      return data;
    } catch (err) {
      if (err.status !== undefined) throw err;
      throw { status: 0, message: 'Network connection failed. Unable to reach server at port 5000.' };
    }
  },

  patch: async (endpoint, body) => {
    try {
      const res = await apiRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw { status: res.status, data, message: extractErrorMessage(res, data) };
      }
      return data;
    } catch (err) {
      if (err.status !== undefined) throw err;
      throw { status: 0, message: 'Network connection failed. Unable to reach server at port 5000.' };
    }
  },

  put: async (endpoint, body) => {
    try {
      const res = await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw { status: res.status, data, message: extractErrorMessage(res, data) };
      }
      return data;
    } catch (err) {
      if (err.status !== undefined) throw err;
      throw { status: 0, message: 'Network connection failed. Unable to reach server at port 5000.' };
    }
  },

  delete: async (endpoint) => {
    try {
      const res = await apiRequest(endpoint, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw { status: res.status, data, message: extractErrorMessage(res, data) };
      }
      return data;
    } catch (err) {
      if (err.status !== undefined) throw err;
      throw { status: 0, message: 'Network connection failed. Unable to reach server at port 5000.' };
    }
  },

  downloadBlob: async (endpoint) => {
    try {
      const res = await apiRequest(endpoint, { method: 'GET' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw { status: res.status, data, message: extractErrorMessage(res, data) };
      }
      return await res.blob();
    } catch (err) {
      if (err.status !== undefined) throw err;
      throw { status: 0, message: 'Network connection failed. Unable to reach server at port 5000.' };
    }
  }
};
