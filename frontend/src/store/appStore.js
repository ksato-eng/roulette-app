import { create } from 'zustand'
import { api } from '../hooks/useApi'

export const useAppStore = create((set, get) => ({
  prizes: [],
  totalDrawCount: 0,
  history: [],
  loading: false,
  error: null,

  fetchState: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api.getState()
      set({ prizes: data.prizes, totalDrawCount: data.totalDrawCount, history: data.history, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  pickWinner: async () => {
    return await api.pickWinner()
  },

  confirmDraw: async (prizeId) => {
    const data = await api.confirmDraw(prizeId)
    set({ prizes: data.prizes, totalDrawCount: data.totalDrawCount })
    // 履歴を再取得
    const histData = await api.getHistory()
    set({ history: histData })
    return data
  },

  createPrize: async (data) => {
    await api.createPrize(data)
    await get().fetchState()
  },

  updatePrize: async (id, data) => {
    await api.updatePrize(id, data)
    await get().fetchState()
  },

  deletePrize: async (id) => {
    await api.deletePrize(id)
    await get().fetchState()
  },

  clearHistory: async () => {
    await api.clearHistory()
    await get().fetchState()
  },

  resetAll: async () => {
    await api.resetAll()
    await get().fetchState()
  },
}))
