import { create } from 'zustand'
import { VPNSession } from '../types/vpn'
import { loadSessionFromDisk, saveSessionToDisk, clearSessionFromDisk } from '../services/storageService'

interface SessionStore {
  session: VPNSession | null
  isConnecting: boolean
  isDisconnecting: boolean
  error: string | null
  restoreSession: () => Promise<void>
  startSession: (nodeId: string, nodeAddress: string) => Promise<VPNSession>
  updateSessionStats: (stats: Partial<VPNSession>) => void
  stopSession: () => Promise<void>
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  isConnecting: false,
  isDisconnecting: false,
  error: null,

  restoreSession: async () => {
    try {
      const session = await loadSessionFromDisk()
      if (session) {
        set({ session })
      }
    } catch (error) {
      console.error('Failed to restore session:', error)
    }
  },

  startSession: async (nodeId: string, nodeAddress: string) => {
    set({ isConnecting: true, error: null })
    try {
      const session: VPNSession = {
        id: `session-${Date.now()}`,
        nodeId,
        nodeAddress,
        startTime: new Date(),
        isActive: true,
        elapsedTime: 0,
        estimatedSpend: 0,
        wireguardConfig: '',
      }

      await saveSessionToDisk(session)
      set({ session, isConnecting: false, error: null })
      return session
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start session'
      set({ error: message, isConnecting: false })
      throw error
    }
  },

  updateSessionStats: (stats: Partial<VPNSession>) => {
    set((state) => ({
      session: state.session ? { ...state.session, ...stats } : null,
    }))
  },

  stopSession: async () => {
    set({ isDisconnecting: true, error: null })
    try {
      await clearSessionFromDisk()
      set({ session: null, isDisconnecting: false, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop session'
      set({ error: message, isDisconnecting: false })
      throw error
    }
  },
}))
