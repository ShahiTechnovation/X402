import { useEffect } from 'react'
import { VPNSession } from '../../types/vpn'
import { useSessionStore } from '../../store/sessionStore'
import { formatDistanceToNow } from 'date-fns'

interface SessionStatsProps {
  session: VPNSession
}

export default function SessionStats({ session }: SessionStatsProps) {
  const { updateSessionStats } = useSessionStore()

  useEffect(() => {
    const interval = setInterval(() => {
      if (session.isActive) {
        const elapsedMs = Date.now() - new Date(session.startTime).getTime()
        const elapsedSeconds = Math.floor(elapsedMs / 1000)
        const estimatedSpend = (elapsedSeconds / 60) * 0.001 // Assuming $0.001 per minute

        updateSessionStats({
          elapsedTime: elapsedSeconds,
          estimatedSpend,
        })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [session, updateSessionStats])

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    return `${minutes}m ${secs}s`
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-6">Session Stats</h2>

      <div className="space-y-4">
        <div>
          <p className="text-slate-400 text-sm mb-1">Elapsed Time</p>
          <p className="text-2xl font-bold text-green-400">
            {formatTime(session.elapsedTime)}
          </p>
        </div>

        <div>
          <p className="text-slate-400 text-sm mb-1">Estimated Spend</p>
          <p className="text-2xl font-bold text-orange-400">
            ${session.estimatedSpend.toFixed(4)}
          </p>
        </div>

        <div>
          <p className="text-slate-400 text-sm mb-1">Bytes In</p>
          <p className="text-lg font-medium text-blue-400">
            {Math.random().toFixed(2)} MB
          </p>
        </div>

        <div>
          <p className="text-slate-400 text-sm mb-1">Bytes Out</p>
          <p className="text-lg font-medium text-blue-400">
            {Math.random().toFixed(2)} MB
          </p>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Connected to</p>
          <p className="text-sm font-medium text-white">{session.nodeAddress}</p>
        </div>
      </div>
    </div>
  )
}
