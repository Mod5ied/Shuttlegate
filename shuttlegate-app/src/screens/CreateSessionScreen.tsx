import { useState } from '@lynx-js/react'
import { apiPost, generateIdempotencyKey } from '../api/client.js'
import type { SessionCreateBody, PaymentSession } from '@shuttlegate/types'

interface CreateSessionScreenProps {
  token: string
  onCreated: (session: PaymentSession) => void
  onBack: () => void
}

export function CreateSessionScreen({ token, onCreated, onBack }: CreateSessionScreenProps) {
  const [type, setType] = useState<'temporary' | 'long_running'>('temporary')
  const [fare, setFare] = useState('50')
  const [capacity, setCapacity] = useState('4')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setLoading(true)
    setError('')

    const body: SessionCreateBody = {
      type,
      fare_points: Number(fare),
      capacity: Number(capacity),
    }

    const result = await apiPost<PaymentSession>(
      '/session/create',
      body,
      { token, idempotencyKey: generateIdempotencyKey() },
    )

    setLoading(false)
    if (result.ok) {
      onCreated(result.data as PaymentSession)
    } else {
      setError(String((result.data as { error?: string }).error ?? 'Create failed'))
    }
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Create QR Session</text>

      <text>Type</text>
      <view style={{ flexDirection: 'row', marginBottom: 12 }}>
        <view
          bindtap={() => setType('temporary')}
          style={{ padding: 8, backgroundColor: type === 'temporary' ? '#ccc' : '#fff' }}
        >
          <text>Temporary</text>
        </view>
        <view
          bindtap={() => setType('long_running')}
          style={{ padding: 8, backgroundColor: type === 'long_running' ? '#ccc' : '#fff' }}
        >
          <text>Banner</text>
        </view>
      </view>

      <text>Fare (points)</text>
      <input
        type='digit'
        bindinput={(e) => setFare(e.detail.value)}
        style={{ borderWidth: 1, padding: 8, marginBottom: 12 }}
      />

      <text>Capacity</text>
      <input
        type='digit'
        bindinput={(e) => setCapacity(e.detail.value)}
        style={{ borderWidth: 1, padding: 8, marginBottom: 12 }}
      />

      {error ? <text style={{ color: 'red', marginBottom: 12 }}>{error}</text> : null}

      <view bindtap={handleCreate} style={{ backgroundColor: '#007AFF', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Creating...' : 'Create Session'}
        </text>
      </view>

      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
