import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardView from '../DashboardView'

vi.mock('../../store/walletStore', () => ({
  useWalletStore: () => ({
    wallet: { address: '0x1234567890123456789012345678901234567890', source: 'in-app', isConnected: true },
    disconnect: vi.fn(),
  }),
}))

vi.mock('../../store/vpnStore', () => ({
  useVPNStore: () => ({
    servers: [
      {
        id: 'server-1',
        name: 'Test Server',
        region: 'Test',
        location: 'Test Location',
        latency: 50,
        pricePerMinute: 0.001,
        isOnline: true,
        address: '192.0.2.1',
      },
    ],
    selectedServer: null,
    selectServer: vi.fn(),
  }),
}))

vi.mock('../../store/sessionStore', () => ({
  useSessionStore: () => ({
    session: null,
  }),
}))

describe('DashboardView', () => {
  it('renders dashboard header', () => {
    render(<DashboardView />)
    expect(screen.getByText('VPN Client')).toBeInTheDocument()
    expect(screen.getByText('Decentralized VPN Network')).toBeInTheDocument()
  })

  it('displays wallet address', () => {
    render(<DashboardView />)
    expect(screen.getByText(/0x1234.*7890/)).toBeInTheDocument()
  })

  it('renders balance card', () => {
    render(<DashboardView />)
    expect(screen.getByText(/x402 Token Balance/)).toBeInTheDocument()
  })

  it('renders server list section', () => {
    render(<DashboardView />)
    expect(screen.getByText('Available Servers')).toBeInTheDocument()
  })

  it('renders connect panel', () => {
    render(<DashboardView />)
    expect(screen.getByText('Connection')).toBeInTheDocument()
  })
})
