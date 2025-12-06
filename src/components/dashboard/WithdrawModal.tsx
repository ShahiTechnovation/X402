import { useState } from 'react'
import { toast } from 'sonner'

interface WithdrawModalProps {
  onClose: () => void
  maxAmount: string
}

export default function WithdrawModal({ onClose, maxAmount }: WithdrawModalProps) {
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (parseFloat(amount) > parseFloat(maxAmount)) {
      toast.error('Insufficient balance')
      return
    }

    setIsLoading(true)
    try {
      // Call contract withdraw method
      toast.success(`Withdrew ${amount} x402`)
      onClose()
    } catch (error) {
      toast.error('Failed to withdraw')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Withdraw x402</h2>

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
            <p className="text-xs text-slate-400 mt-2">
              Max: {maxAmount} x402
            </p>
          </div>

          <button
            onClick={() => setAmount(maxAmount)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Use max amount
          </button>

          <div className="bg-slate-700/50 rounded-lg p-3 text-sm text-slate-300">
            Withdrawn tokens will be transferred to your wallet address
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleWithdraw}
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
            >
              {isLoading ? 'Processing...' : 'Withdraw'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
