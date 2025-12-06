import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import WalletModal from './components/WalletModal'
import DashboardView from './components/DashboardView'
import { useWalletStore } from './store/walletStore'
import { useSessionStore } from './store/sessionStore'
import { useVPNStore } from './store/vpnStore'
import { initializeApp } from './services/appService'

function App() {
  const { wallet, initialize } = useWalletStore()
  const { restoreSession } = useSessionStore()
  const { initializeVPN } = useVPNStore()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        await initializeApp()
        await initialize()
        await restoreSession()
        await initializeVPN()
      } catch (error) {
        console.error('Failed to initialize app:', error)
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [initialize, restoreSession, initializeVPN])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p>Initializing VPN Client...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {!wallet ? <WalletModal /> : <DashboardView />}
      <Toaster position="top-center" />
    </>
  )
}

export default App
