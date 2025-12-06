import { create } from 'zustand'
import { Wallet } from '../types/wallet'
import { generateWallet, importWallet, saveWalletSecurely, loadWalletSecurely } from '../services/walletService'

interface WalletStore {
  wallet: Wallet | null
  isConnecting: boolean
  error: string | null
  initialize: () => Promise<void>
  createInAppWallet: (password: string) => Promise<Wallet>
  importExistingWallet: (seedPhrase: string, password: string) => Promise<Wallet>
  connectWalletConnect: () => Promise<Wallet>
  disconnect: () => void
}

export const useWalletStore = create<WalletStore>((set) => ({
  wallet: null,
  isConnecting: false,
  error: null,

  initialize: async () => {
    try {
      const savedWallet = await loadWalletSecurely()
      if (savedWallet) {
        set({ wallet: savedWallet, error: null })
      }
    } catch (error) {
      console.error('Failed to load wallet:', error)
      set({ error: 'Failed to load wallet' })
    }
  },

  createInAppWallet: async (password: string) => {
    set({ isConnecting: true, error: null })
    try {
      const wallet = await generateWallet(password)
      await saveWalletSecurely(wallet)
      set({ wallet, isConnecting: false, error: null })
      return wallet
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet'
      set({ error: message, isConnecting: false })
      throw error
    }
  },

  importExistingWallet: async (seedPhrase: string, password: string) => {
    set({ isConnecting: true, error: null })
    try {
      const wallet = await importWallet(seedPhrase, password)
      await saveWalletSecurely(wallet)
      set({ wallet, isConnecting: false, error: null })
      return wallet
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet'
      set({ error: message, isConnecting: false })
      throw error
    }
  },

  connectWalletConnect: async () => {
    set({ isConnecting: true, error: null })
    try {
      // WalletConnect integration would go here
      // For now, returning a placeholder
      const wallet: Wallet = {
        address: '0x...',
        source: 'walletconnect',
        isConnected: true,
      }
      set({ wallet, isConnecting: false, error: null })
      return wallet
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect WalletConnect'
      set({ error: message, isConnecting: false })
      throw error
    }
  },

  disconnect: () => {
    set({ wallet: null, error: null })
  },
}))
