import { useState, useEffect } from 'react'
import { useWalletStore } from '../store/walletStore'
import { useVPNStore } from '../store/vpnStore'
import { useSessionStore } from '../store/sessionStore'
import BalanceCard from './dashboard/BalanceCard'
import ServerList from './dashboard/ServerList'
import ConnectPanel from './dashboard/ConnectPanel'
import SessionStats from './dashboard/SessionStats'
import TransactionHistory from './dashboard/TransactionHistory'
import WalletMenu from './dashboard/WalletMenu'

export default function DashboardView() {
  const { wallet, disconnect } = useWalletStore()
  const { servers, selectedServer } = useVPNStore()
  const { session } = useSessionStore()
  const [showWalletMenu, setShowWalletMenu] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">VPN Client</h1>
            <p className="text-slate-400 text-sm">Decentralized VPN Network</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowWalletMenu(!showWalletMenu)}
              className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
              <span>👤</span>
              {wallet?.address?.slice(0, 6)}...{wallet?.address?.slice(-4)}
            </button>
            {showWalletMenu && (
              <WalletMenu onClose={() => setShowWalletMenu(false)} onDisconnect={disconnect} />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Balance */}
            <BalanceCard />

            {/* Server List */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4">Available Servers</h2>
              <ServerList servers={servers} />
            </div>

            {/* Transaction History */}
            <TransactionHistory />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Connect Panel */}
            <ConnectPanel selectedServer={selectedServer} />

            {/* Session Stats */}
            {session && <SessionStats session={session} />}
          </div>
        </div>
      </main>
    </div>
  )
}
