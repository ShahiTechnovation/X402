export interface Wallet {
  address: string
  source: 'in-app' | 'walletconnect'
  isConnected: boolean
  seedPhrase?: string
  encryptedSeedPhrase?: string
}

export interface WalletBalance {
  address: string
  balance: string
  decimals: number
  symbol: string
}

export interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: Date
}
