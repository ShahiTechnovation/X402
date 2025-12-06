import { create } from 'zustand'
import { Server, VPNStats } from '../types/vpn'
import { NodeRegistry, SessionManager } from '../services/nodeService'

interface VPNStore {
  servers: Server[]
  selectedServer: Server | null
  stats: VPNStats | null
  isProbing: boolean
  isLoading: boolean
  error: string | null
  initializeVPN: () => Promise<void>
  probeServers: () => Promise<void>
  selectServer: (serverId: string) => void
  updateStats: (stats: Partial<VPNStats>) => void
  getBalance: () => Promise<string>
}

export const useVPNStore = create<VPNStore>((set, get) => ({
  servers: [
    {
      id: 'server-india',
      name: 'India',
      region: 'Asia',
      location: 'Mumbai',
      latency: null,
      pricePerMinute: 0,
      isOnline: false,
      address: '192.0.2.1',
    },
    {
      id: 'server-europe',
      name: 'Europe',
      region: 'EU',
      location: 'Frankfurt',
      latency: null,
      pricePerMinute: 0,
      isOnline: false,
      address: '192.0.2.2',
    },
  ],
  selectedServer: null,
  stats: null,
  isProbing: false,
  isLoading: false,
  error: null,

  initializeVPN: async () => {
    set({ isLoading: true })
    try {
      const { probeServers } = get()
      await probeServers()
      set({ isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize VPN'
      set({ error: message, isLoading: false })
    }
  },

  probeServers: async () => {
    set({ isProbing: true })
    try {
      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          latency: Math.random() * 100 + 10,
          isOnline: Math.random() > 0.1,
          pricePerMinute: 0.001 * (1 + Math.random() * 0.5),
        })),
      }))
      set({ isProbing: false })
    } catch (error) {
      console.error('Failed to probe servers:', error)
      set({ isProbing: false })
    }
  },

  selectServer: (serverId: string) => {
    set((state) => {
      const server = state.servers.find((s) => s.id === serverId)
      return { selectedServer: server || null }
    })
  },

  updateStats: (stats: Partial<VPNStats>) => {
    set((state) => ({
      stats: state.stats ? { ...state.stats, ...stats } : stats as VPNStats,
    }))
  },

  getBalance: async (): Promise<string> => {
    try {
      // This would call the actual SessionManager/ERC20 service
      return '100.0'
    } catch (error) {
      console.error('Failed to get balance:', error)
      throw error
    }
  },
}))
