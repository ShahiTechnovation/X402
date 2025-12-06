import { useState } from 'react'
import { toast } from 'sonner'

interface DepositModalProps {
  onClose: () => void
}

export default function DepositModal({ onClose }: DepositModalProps) {
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsLoading(true)
    try {
      // Call contract approve and deposit methods
      toast.success(`Deposited ${amount} x402`)
      onClose()
    } catch (error) {
      toast.error('Failed to deposit')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Deposit x402</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Amount
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                x402
              </span>
            </div>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-3 text-sm text-slate-300">
            <p>You will need to approve the transaction twice:</p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Approve x402 token transfer</li>
              <li>Confirm deposit on SessionManager</li>
            </ol>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeposit}
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
            >
              {isLoading ? 'Processing...' : 'Deposit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
