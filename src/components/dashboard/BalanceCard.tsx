import { useState, useEffect } from 'react'
import { useVPNStore } from '../../store/vpnStore'
import { SessionManager } from '../../services/nodeService'
import { useWalletStore } from '../../store/walletStore'
import DepositModal from './DepositModal'
import WithdrawModal from './WithdrawModal'

export default function BalanceCard() {
  const { wallet } = useWalletStore()
  const [balance, setBalance] = useState<string>('0.00')
  const [loading, setLoading] = useState(true)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)

  useEffect(() => {
    const fetchBalance = async () => {
      if (!wallet) return
      try {
        setLoading(true)
        const sm = SessionManager.getInstance()
        const bal = await sm.getUserBalance(wallet.address)
        setBalance(bal)
      } catch (error) {
        console.error('Failed to fetch balance:', error)
        setBalance('0.00')
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 30000) // Update every 30s

    return () => clearInterval(interval)
  }, [wallet])

  return (
    <>
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-6 border border-blue-500/20">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-blue-100 text-sm mb-1">x402 Token Balance</p>
            <h3 className="text-3xl font-bold">
              {loading ? '...' : balance} x402
            </h3>
          </div>
          <div className="text-4xl">💰</div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowDeposit(true)}
            className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Deposit
          </button>
          <button
            onClick={() => setShowWithdraw(true)}
            className="bg-blue-500/30 hover:bg-blue-500/50 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-blue-400/50"
          >
            Withdraw
          </button>
        </div>
      </div>

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
      {showWithdraw && <WithdrawModal onClose={() => setShowWithdraw(false)} maxAmount={balance} />}
    </>
  )
}
