import { useState } from 'react'
import { Server } from '../../types/vpn'
import { useVPNStore } from '../../store/vpnStore'

interface ServerListProps {
  servers: Server[]
}

type SortField = 'name' | 'latency' | 'price'
type SortOrder = 'asc' | 'desc'

export default function ServerList({ servers }: ServerListProps) {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const { selectedServer, selectServer } = useVPNStore()

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortedServers = [...servers].sort((a, b) => {
    let aVal: string | number
    let bVal: string | number

    switch (sortField) {
      case 'name':
        aVal = a.name
        bVal = b.name
        break
      case 'latency':
        aVal = a.latency ?? 999
        bVal = b.latency ?? 999
        break
      case 'price':
        aVal = a.pricePerMinute
        bVal = b.pricePerMinute
        break
    }

    if (typeof aVal === 'string') {
      return sortOrder === 'asc'
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal)
    }

    return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-3 px-4 font-medium text-slate-300 cursor-pointer hover:text-white"
              onClick={() => handleSort('name')}>
              Server {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th className="text-left py-3 px-4 font-medium text-slate-300 cursor-pointer hover:text-white"
              onClick={() => handleSort('latency')}>
              Latency {sortField === 'latency' && (sortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th className="text-left py-3 px-4 font-medium text-slate-300 cursor-pointer hover:text-white"
              onClick={() => handleSort('price')}>
              Price/min {sortField === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th className="text-left py-3 px-4 font-medium text-slate-300">Status</th>
            <th className="text-left py-3 px-4 font-medium text-slate-300">Action</th>
          </tr>
        </thead>
        <tbody>
          {sortedServers.map((server) => (
            <tr
              key={server.id}
              className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors"
            >
              <td className="py-3 px-4">
                <div>
                  <p className="font-medium text-white">{server.name}</p>
                  <p className="text-xs text-slate-400">{server.location}</p>
                </div>
              </td>
              <td className="py-3 px-4">
                {server.latency !== null ? `${Math.round(server.latency)}ms` : 'N/A'}
              </td>
              <td className="py-3 px-4">
                ${server.pricePerMinute.toFixed(4)}/min
              </td>
              <td className="py-3 px-4">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    server.isOnline
                      ? 'bg-green-900 text-green-100'
                      : 'bg-red-900 text-red-100'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {server.isOnline ? 'Online' : 'Offline'}
                </span>
              </td>
              <td className="py-3 px-4">
                <button
                  onClick={() => selectServer(server.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    selectedServer?.id === server.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {selectedServer?.id === server.id ? '✓ Selected' : 'Select'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
