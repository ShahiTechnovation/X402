export interface Server {
  id: string
  name: string
  region: string
  location: string
  latency: number | null
  pricePerMinute: number
  isOnline: boolean
  address: string
}

export interface VPNSession {
  id: string
  nodeId: string
  nodeAddress: string
  startTime: Date
  isActive: boolean
  elapsedTime: number
  estimatedSpend: number
  wireguardConfig: string
}

export interface VPNStats {
  elapsedTime: number
  estimatedSpend: number
  remainingBalance: string
  bytesIn: number
  bytesOut: number
}

export interface WireGuardConfig {
  privateKey: string
  address: string
  dns: string[]
  endpoint: string
  publicKey: string
  allowedIps: string
  persistentKeepalive: number
}
