import { useState } from '@lynx-js/react'
import { apiPost, generateIdempotencyKey } from '../api/client.js'
import type { Cashout } from '@shuttlegate/types'

interface CashOutScreenProps {
  token: string
  onBack: () => void
}

export function CashOutScreen({ token, onBack }: CashOutScreenProps) {
  const [points, setPoints] = useState('')
  const [destination, setDestination] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [cashout, setCashout] = useState<Cashout | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setMessage('')
    const res = await apiPost<Cashout>(
      '/driver/cashout',
      { points: Number(points), destination },
      { token, idempotencyKey: generateIdempotencyKey() },
    )
    setLoading(false)
    if (res.ok) {
      setCashout(res.data as Cashout)
      setMessage('Cash-out request submitted')
    } else {
      setMessage(String((res.data as { error?: string }).error ?? 'Cash-out failed'))
    }
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Cash Out</text>

      {cashout ? (
        <view style={{ backgroundColor: '#fff', padding: 12, marginBottom: 12 }}>
          <text>Requested: {cashout.points} points</text>
          <text>Status: {cashout.status}</text>
          <text>Destination: {cashout.destination}</text>
        </view>
      ) : null}

      <text>Points</text>
      <input
        type='digit'
        bindinput={(e: { detail: { value: string } }) => setPoints(e.detail.value)}
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12 }}
      />

      <text>Destination (mobile money / bank)</text>
      <input
        bindinput={(e: { detail: { value: string } }) => setDestination(e.detail.value)}
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12 }}
      />

      {message ? <text style={{ marginBottom: 12 }}>{message}</text> : null}

      <view bindtap={handleSubmit} style={{ backgroundColor: '#34C759', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>{loading ? 'Submitting...' : 'Request Cash Out'}</text>
      </view>

      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
