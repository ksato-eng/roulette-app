// API通信フック

const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  getState: () => req('GET', '/state'),
  pickWinner: () => req('POST', '/draw/pick'),
  confirmDraw: (prizeId) => req('POST', '/draw/confirm', { prizeId }),

  getPrizes: () => req('GET', '/prizes'),
  createPrize: (data) => req('POST', '/prizes', data),
  updatePrize: (id, data) => req('PUT', `/prizes/${id}`, data),
  deletePrize: (id) => req('DELETE', `/prizes/${id}`),

  getHistory: () => req('GET', '/history'),
  clearHistory: () => req('DELETE', '/history'),
  resetAll: () => req('POST', '/reset'),

  getSoundConfig: () => req('GET', '/sound-config'),
  updateSoundConfig: (data) => req('POST', '/sound-config', data),
}
