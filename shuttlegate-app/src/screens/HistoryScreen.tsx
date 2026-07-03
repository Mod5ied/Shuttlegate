import { useEffect, useState } from '@lynx-js/react'
import { apiGet } from '../api/client.js'
import type { Transaction } from '@shuttlegate/types'

interface HistoryScreenProps {
  token: string
  onBack: () => void
}

export function HistoryScreen({ token, onBack }: HistoryScreenProps) {
  const [transactions, setTransactions] = useState<Array<Transaction & { from_name?: string; to_name?: string }>>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await apiGet<{ transactions: Array<Transaction & { from_name?: string; to_name?: string }> }>(
      '/payment/history',
      token,
    )
    if (res.ok) {
      setTransactions((res.data as { transactions: Array<Transaction & { from_name?: string; to_name?: string }> }).transactions)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>History</text>

      {loading ? <text>Loading...</text> : null}

      {transactions.map((tx) => (
        <view key={tx.id} style={{ backgroundColor: '#fff', padding: 12, marginBottom: 8 }}>
          <text>{tx.points} points — {tx.batch_status}</text>
          <text style={{ fontSize: 12 }}>
            {tx.from_name} → {tx.to_name}
          </text>
          <text style={{ fontSize: 10, color: '#666' }}>{tx.created_at}</text>
        </view>
      ))}

      <view bindtap={load} style={{ backgroundColor: '#5856D6', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Refresh</text>
      </view>

      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
