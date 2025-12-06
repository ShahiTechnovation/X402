import { useState } from 'react'
import { useWalletStore } from '../../store/walletStore'
import { toast } from 'sonner'

export default function WalletConnectForm() {
  const { connectWalletConnect, isConnecting } = useWalletStore()
  const [isSupported] = useState(true)

  const handleConnect = async () => {
    try {
      await connectWalletConnect()
      toast.success('Wallet connected successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect wallet')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-700 rounded-lg p-6 text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h3 className="text-lg font-medium text-white mb-2">WalletConnect</h3>
        <p className="text-slate-300 text-sm mb-4">
          Connect using your favorite Web3 wallet like MetaMask, Trust Wallet, or others
        </p>

        {isSupported ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
          >
            {isConnecting ? 'Connecting...' : 'Connect with WalletConnect'}
          </button>
        ) : (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3 text-yellow-100 text-sm">
            WalletConnect is not available in your region
          </div>
        )}
      </div>

      <div className="bg-slate-700 border border-slate-600 rounded-lg p-4 text-sm text-slate-300">
        <p className="font-medium text-white mb-2">Popular Wallets:</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>MetaMask</div>
          <div>Trust Wallet</div>
          <div>Coinbase Wallet</div>
          <div>Ledger Live</div>
          <div>Trezor</div>
          <div>More...</div>
        </div>
      </div>
    </div>
  )
}
