import { useState } from 'react'
import { useWalletStore } from '../../store/walletStore'
import { toast } from 'sonner'

export default function ImportWalletForm() {
  const [seedPhrase, setSeedPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { importExistingWallet, isConnecting } = useWalletStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!seedPhrase.trim()) {
      toast.error('Please enter a seed phrase')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    try {
      await importExistingWallet(seedPhrase.trim(), password)
      toast.success('Wallet imported successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import wallet')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Seed Phrase
        </label>
        <textarea
          value={seedPhrase}
          onChange={(e) => setSeedPhrase(e.target.value)}
          placeholder="Enter your 12 or 24 word seed phrase"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a password for this wallet"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Confirm Password
        </label>
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your password"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isConnecting}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
      >
        {isConnecting ? 'Importing...' : 'Import Wallet'}
      </button>
    </form>
  )
}
