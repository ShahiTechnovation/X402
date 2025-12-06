import axios from 'axios'
import { WireGuardConfig } from '../types/vpn'

const RPC_URL = 'https://sepolia.base.org'
const SESSION_MANAGER_ADDRESS = '0x...' // Replace with actual address
const X402_TOKEN_ADDRESS = '0x...' // Replace with actual address

export class NodeRegistry {
  private static instance: NodeRegistry

  private constructor() {}

  public static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry()
    }
    return NodeRegistry.instance
  }

  async getNodePrice(nodeAddress: string): Promise<number> {
    try {
      const response = await axios.get(`http://${nodeAddress}:8080/api/price`)
      return response.data.pricePerMinute
    } catch (error) {
      console.error('Failed to get node price:', error)
      return 0.001
    }
  }

  async getNodeHealth(nodeAddress: string): Promise<boolean> {
    try {
      const response = await axios.get(`http://${nodeAddress}:8080/api/health`, {
        timeout: 5000,
      })
      return response.status === 200
    } catch (error) {
      console.error('Failed to check node health:', error)
      return false
    }
  }

  async getLatency(nodeAddress: string): Promise<number> {
    try {
      const startTime = Date.now()
      await axios.get(`http://${nodeAddress}:8080/api/ping`, {
        timeout: 10000,
      })
      return Date.now() - startTime
    } catch (error) {
      console.error('Failed to measure latency:', error)
      return 999
    }
  }
}

export class SessionManager {
  private static instance: SessionManager

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  async startSession(
    walletAddress: string,
    nodeAddress: string,
    amount: string
  ): Promise<string> {
    try {
      // Call smart contract startSession method
      // Return transaction hash
      return `0x${'0'.repeat(64)}`
    } catch (error) {
      console.error('Failed to start session:', error)
      throw error
    }
  }

  async stopSession(sessionId: string): Promise<string> {
    try {
      // Call smart contract stopSession method
      // Return transaction hash
      return `0x${'0'.repeat(64)}`
    } catch (error) {
      console.error('Failed to stop session:', error)
      throw error
    }
  }

  async getUserBalance(walletAddress: string): Promise<string> {
    try {
      // Query balance from ERC20 token contract
      return '100.0'
    } catch (error) {
      console.error('Failed to get user balance:', error)
      throw error
    }
  }

  async getSessionStatus(sessionId: string): Promise<{
    isActive: boolean
    elapsedTime: number
    estimatedSpend: number
  }> {
    try {
      return {
        isActive: true,
        elapsedTime: Date.now(),
        estimatedSpend: 0.01,
      }
    } catch (error) {
      console.error('Failed to get session status:', error)
      throw error
    }
  }
}

export class WireGuardService {
  private static instance: WireGuardService

  private constructor() {}

  public static getInstance(): WireGuardService {
    if (!WireGuardService.instance) {
      WireGuardService.instance = new WireGuardService()
    }
    return WireGuardService.instance
  }

  async getWireGuardConfig(nodeAddress: string): Promise<WireGuardConfig> {
    try {
      const response = await axios.get(`http://${nodeAddress}:8080/api/wireguard/config`)
      return response.data
    } catch (error) {
      console.error('Failed to get WireGuard config:', error)
      throw error
    }
  }

  async startWireGuard(config: WireGuardConfig): Promise<boolean> {
    try {
      if (typeof window === 'undefined') {
        // Electron main process
        return true
      }
      return true
    } catch (error) {
      console.error('Failed to start WireGuard:', error)
      throw error
    }
  }

  async stopWireGuard(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') {
        // Electron main process
        return true
      }
      return true
    } catch (error) {
      console.error('Failed to stop WireGuard:', error)
      throw error
    }
  }
}
