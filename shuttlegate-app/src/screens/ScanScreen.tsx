import { useState } from '@lynx-js/react'
import { apiPost, generateIdempotencyKey } from '../api/client.js'
import { useOnlineStatus } from '../hooks/useOnlineStatus.js'
import type { ScanBody, ScanResponse } from '@shuttlegate/types'

interface ScanScreenProps {
  token: string
  onBack: () => void
}

export function ScanScreen({ token, onBack }: ScanScreenProps) {
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState('')
  const { online } = useOnlineStatus()

  const handleScan = async () => {
    setLoading(true)
    setError('')
    setResult(null)

    if (!online) {
      setError('You are offline. Please reconnect to pay.')
      setLoading(false)
      return
    }

    const body: ScanBody = { session_id: sessionId }
    const res = await apiPost<ScanResponse>('/payment/scan', body, {
      token,
      idempotencyKey: generateIdempotencyKey(),
    })

    setLoading(false)
    if (res.ok) {
      setResult(res.data as ScanResponse)
    } else {
      setError(String((res.data as { error?: string }).error ?? 'Payment failed'))
    }
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Scan & Pay</text>

      <text>Session ID</text>
      <input
        bindinput={(e) => setSessionId(e.detail.value)}
        style={{ borderWidth: 1, padding: 8, marginBottom: 12 }}
      />

      {error ? <text style={{ color: 'red', marginBottom: 12 }}>{error}</text> : null}

      {result ? (
        <view style={{ backgroundColor: '#fff', padding: 12, marginBottom: 12 }}>
          <text>{result.message}</text>
          {result.transaction_id ? <text>Tx: {result.transaction_id}</text> : null}
        </view>
      ) : null}

      <view bindtap={handleScan} style={{ backgroundColor: '#34C759', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Paying...' : 'Pay'}
        </text>
      </view>

      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
