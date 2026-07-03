import { useEffect, useState } from '@lynx-js/react'
import { apiGet } from '../api/client.js'
import type { PaymentSession } from '@shuttlegate/types'

interface DriverHomeScreenProps {
  token: string
  onCreateSession: () => void
  onViewSession: (id: string) => void
  onViewHistory: () => void
  onIssueRefund: () => void
  onCashOut: () => void
  onViewEarnings: () => void
}

export function DriverHomeScreen({
  token,
  onCreateSession,
  onViewSession,
  onViewHistory,
  onIssueRefund,
  onCashOut,
  onViewEarnings,
}: DriverHomeScreenProps) {
  const [sessions, setSessions] = useState<PaymentSession[]>([])
  const [loading, setLoading] = useState(false)

  // ponytail: no dedicated list endpoint yet; load from known sessions via
  // local storage in a real app. Here we just show a placeholder list.
  const load = async () => {
    setLoading(true)
    // TODO: add GET /session/list endpoint if needed
    setSessions([])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Driver Home</text>

      {loading ? <text>Loading...</text> : null}

      <view bindtap={onCreateSession} style={{ backgroundColor: '#007AFF', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Create QR Session</text>
      </view>

      <view bindtap={onViewHistory} style={{ backgroundColor: '#5856D6', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Transaction History</text>
      </view>

      <view bindtap={onIssueRefund} style={{ backgroundColor: '#FF9500', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Issue Refund</text>
      </view>

      <view bindtap={onCashOut} style={{ backgroundColor: '#34C759', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Cash Out</text>
      </view>

      <view bindtap={onViewEarnings} style={{ backgroundColor: '#007AFF', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Earnings</text>
      </view>

      <text style={{ marginTop: 20, marginBottom: 12 }}>Active sessions will appear here once a list endpoint is added.</text>
    </view>
  )
}
