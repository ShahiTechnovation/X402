import { useEffect, useState } from 'react'
import { Transaction } from '../../types/wallet'

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    // Load transaction history from storage or API
    const mockTransactions: Transaction[] = [
      {
        hash: '0x123...abc',
        from: '0xUser',
        to: '0xServer',
        value: '10.50',
        status: 'confirmed',
        timestamp: new Date(Date.now() - 3600000),
      },
      {
        hash: '0x456...def',
        from: '0xUser',
        to: '0xServer',
        value: '5.25',
        status: 'confirmed',
        timestamp: new Date(Date.now() - 7200000),
      },
    ]
    setTransactions(mockTransactions)
  }, [])

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-900 text-green-100'
      case 'pending':
        return 'bg-yellow-900 text-yellow-100'
      case 'failed':
        return 'bg-red-900 text-red-100'
    }
  }

  const formatTime = (date: Date) => {
    const now = Date.now()
    const diffMs = now - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Recent Transactions</h2>

      {transactions.length === 0 ? (
        <p className="text-slate-400 text-sm">No transactions yet</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div
              key={tx.hash}
              className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{tx.value} x402</p>
                <p className="text-xs text-slate-400">{tx.hash}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    tx.status
                  )}`}
                >
                  {tx.status}
                </span>
                <span className="text-xs text-slate-400">{formatTime(tx.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
