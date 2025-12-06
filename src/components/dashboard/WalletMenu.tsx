import { useRef, useEffect } from 'react'
import { toast } from 'sonner'

interface WalletMenuProps {
  onClose: () => void
  onDisconnect: () => void
}

export default function WalletMenu({ onClose, onDisconnect }: WalletMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleCopyAddress = () => {
    // Copy wallet address to clipboard
    toast.success('Address copied to clipboard')
  }

  const handleExport = () => {
    toast.info('Export functionality coming soon')
  }

  const handleSettings = () => {
    toast.info('Settings coming soon')
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 mt-2 w-48 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-50"
    >
      <button
        onClick={handleCopyAddress}
        className="w-full text-left px-4 py-2 hover:bg-slate-600 transition-colors border-b border-slate-600 text-sm"
      >
        📋 Copy Address
      </button>
      <button
        onClick={handleExport}
        className="w-full text-left px-4 py-2 hover:bg-slate-600 transition-colors border-b border-slate-600 text-sm"
      >
        💾 Export
      </button>
      <button
        onClick={handleSettings}
        className="w-full text-left px-4 py-2 hover:bg-slate-600 transition-colors border-b border-slate-600 text-sm"
      >
        ⚙️ Settings
      </button>
      <button
        onClick={() => {
          onDisconnect()
          onClose()
          toast.success('Disconnected from wallet')
        }}
        className="w-full text-left px-4 py-2 hover:bg-red-600/20 transition-colors text-red-400 text-sm"
      >
        🚪 Disconnect Wallet
      </button>
    </div>
  )
}
