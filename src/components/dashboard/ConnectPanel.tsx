import { useState, useEffect } from 'react'
import { Server, VPNSession } from '../../types/vpn'
import { useSessionStore } from '../../store/sessionStore'
import { toast } from 'sonner'

interface ConnectPanelProps {
  selectedServer: Server | null
}

export default function ConnectPanel({ selectedServer }: ConnectPanelProps) {
  const { session, isConnecting, isDisconnecting, startSession, stopSession } = useSessionStore()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const handleConnect = async () => {
    if (!selectedServer) {
      toast.error('Please select a server first')
      return
    }

    try {
      await startSession(selectedServer.id, selectedServer.address)
      toast.success(`Connected to ${selectedServer.name}`)
    } catch (error) {
      toast.error('Failed to connect')
    }
  }

  const handleDisconnect = async () => {
    try {
      await stopSession()
      toast.success('Disconnected from VPN')
      setConfirmDisconnect(false)
    } catch (error) {
      toast.error('Failed to disconnect')
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-6">Connection</h2>

      <div className="mb-6">
        <p className="text-slate-400 text-sm mb-2">Selected Server</p>
        <p className="text-lg font-medium">
          {selectedServer?.name || 'None selected'}
        </p>
      </div>

      <div className="mb-6">
        <p className="text-slate-400 text-sm mb-2">Status</p>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              session ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          ></span>
          <p className="text-lg font-medium">
            {session ? 'Connected' : 'Disconnected'}
          </p>
        </div>
      </div>

      {!session ? (
        <button
          onClick={handleConnect}
          disabled={isConnecting || !selectedServer}
          className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-all text-lg"
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      ) : (
        <>
          {confirmDisconnect ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">Are you sure you want to disconnect?</p>
              <div className="flex gap-3">
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors"
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDisconnect(true)}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 rounded-lg transition-all text-lg"
            >
              Disconnect
            </button>
          )}
        </>
      )}
    </div>
  )
}
