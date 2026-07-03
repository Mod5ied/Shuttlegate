import { useEffect, useState } from '@lynx-js/react'
import { apiGet } from '../api/client.js'
import type { Refund } from '@shuttlegate/types'

interface RefundDetailScreenProps {
  token: string
  refundId: string
  onBack: () => void
}

export function RefundDetailScreen({ token, refundId, onBack }: RefundDetailScreenProps) {
  const [refund, setRefund] = useState<Refund | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiGet<Refund>(`/refund/${refundId}`, token).then((res) => {
      if (res.ok) {
        setRefund(res.data as Refund)
      }
      setLoading(false)
    })
  }, [token, refundId])

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Refund Detail</text>
      {loading ? <text>Loading...</text> : null}
      {refund ? (
        <view style={{ backgroundColor: '#fff', padding: 12, marginBottom: 12 }}>
          <text>{refund.points} points refunded</text>
          <text>Reason: {refund.reason}</text>
          <text>Status: {refund.status}</text>
          <text style={{ fontSize: 10, color: '#666' }}>{refund.created_at}</text>
        </view>
      ) : null}
      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
