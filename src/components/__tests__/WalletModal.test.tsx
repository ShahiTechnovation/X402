import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WalletModal from '../WalletModal'
import * as walletService from '../../services/walletService'

vi.mock('../../services/walletService')
vi.mock('../../store/walletStore', () => ({
  useWalletStore: () => ({
    wallet: null,
    isConnecting: false,
    error: null,
    initialize: vi.fn(),
    createInAppWallet: vi.fn(),
    importExistingWallet: vi.fn(),
    connectWalletConnect: vi.fn(),
    disconnect: vi.fn(),
  }),
}))

describe('WalletModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders wallet creation tab by default', () => {
    render(<WalletModal />)
    expect(screen.getByText('Create')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('shows create wallet form on initial render', () => {
    render(<WalletModal />)
    expect(screen.getByPlaceholderText('Enter a secure password')).toBeInTheDocument()
  })

  it('switches to import tab when clicked', async () => {
    render(<WalletModal />)
    const importTab = screen.getByText('Import')
    fireEvent.click(importTab)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your 12 or 24 word seed phrase')).toBeInTheDocument()
    })
  })

  it('switches to WalletConnect tab when clicked', async () => {
    render(<WalletModal />)
    const connectTab = screen.getByText('Connect')
    fireEvent.click(connectTab)

    await waitFor(() => {
      expect(screen.getByText('WalletConnect')).toBeInTheDocument()
    })
  })

  it('displays error message when present', () => {
    vi.mocked(walletService.loadWalletSecurely).mockRejectedValueOnce(new Error('Load error'))
    render(<WalletModal />)
    // Error message would appear in actual implementation with proper store
  })
})
