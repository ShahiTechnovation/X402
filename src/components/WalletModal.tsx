import { useState } from 'react'
import { useWalletStore } from '../store/walletStore'
import { toast } from 'sonner'
import CreateWalletForm from './wallet/CreateWalletForm'
import ImportWalletForm from './wallet/ImportWalletForm'
import WalletConnectForm from './wallet/WalletConnectForm'

type ModalTab = 'create' | 'import' | 'connect'

export default function WalletModal() {
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const { isConnecting, error } = useWalletStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 p-6">
          <h1 className="text-3xl font-bold text-white mb-2">VPN Client</h1>
          <p className="text-slate-400 mb-6">Secure your connection with decentralized VPN</p>

          {error && (
            <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-6 text-red-100 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 mb-6 border-b border-slate-700">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-3 px-4 font-medium transition-colors ${
                activeTab === 'create'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Create
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-1 py-3 px-4 font-medium transition-colors ${
                activeTab === 'import'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Import
            </button>
            <button
              onClick={() => setActiveTab('connect')}
              className={`flex-1 py-3 px-4 font-medium transition-colors ${
                activeTab === 'connect'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Connect
            </button>
          </div>

          {activeTab === 'create' && <CreateWalletForm />}
          {activeTab === 'import' && <ImportWalletForm />}
          {activeTab === 'connect' && <WalletConnectForm />}

          {isConnecting && (
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-400 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
              Processing...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
