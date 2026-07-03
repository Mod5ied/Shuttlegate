import { useEffect, useState } from '@lynx-js/react'
import { apiGet } from '../api/client.js'
import type { PaymentSession, QrDataResponse } from '@shuttlegate/types'

interface SessionDetailScreenProps {
  token: string
  sessionId: string
  onBack: () => void
}

export function SessionDetailScreen({ token, sessionId, onBack }: SessionDetailScreenProps) {
  const [session, setSession] = useState<PaymentSession | null>(null)
  const [qrData, setQrData] = useState<QrDataResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const sessionResult = await apiGet<PaymentSession>(`/session/${sessionId}`, token)
      if (sessionResult.ok) {
        setSession(sessionResult.data as PaymentSession)
      } else {
        setError(String((sessionResult.data as { error?: string }).error ?? 'Load failed'))
      }

      const qrResult = await apiGet<QrDataResponse>(`/session/${sessionId}/qr-data`, token)
      if (qrResult.ok) {
        setQrData(qrResult.data as QrDataResponse)
      }
    }
    load()
  }, [sessionId, token])

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Session Detail</text>

      {error ? <text style={{ color: 'red', marginBottom: 12 }}>{error}</text> : null}

      {session && (
        <view style={{ marginBottom: 20 }}>
          <text>Type: {session.type}</text>
          <text>Fare: {session.fare_points} points</text>
          <text>Capacity: {session.capacity}</text>
          <text>Paid in batch: {session.batch_count}</text>
          <text>Status: {session.status}</text>
        </view>
      )}

      {qrData && (
        <view style={{ backgroundColor: '#fff', padding: 12, marginBottom: 20 }}>
          <text style={{ fontWeight: 'bold', marginBottom: 8 }}>QR Payload</text>
          <text style={{ fontSize: 12 }}>{JSON.stringify(qrData)}</text>
        </view>
      )}

      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
