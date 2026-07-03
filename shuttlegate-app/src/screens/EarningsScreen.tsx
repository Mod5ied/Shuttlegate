import { useEffect, useState } from '@lynx-js/react'
import { apiGet } from '../api/client.js'
import type { EarningsResponse } from '@shuttlegate/types'

interface EarningsScreenProps {
  token: string
  onBack: () => void
}

export function EarningsScreen({ token, onBack }: EarningsScreenProps) {
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await apiGet<EarningsResponse>('/driver/earnings', token)
    if (res.ok) {
      setEarnings(res.data as EarningsResponse)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Earnings</text>
      {loading ? <text>Loading...</text> : null}
      {earnings ? (
        <view>
          <view style={{ backgroundColor: '#fff', padding: 12, marginBottom: 12 }}>
            <text style={{ fontSize: 18 }}>Today</text>
            <text>{earnings.today.points} points</text>
            <text>₦{earnings.today.amount_fiat / 100}</text>
          </view>
          <view style={{ backgroundColor: '#fff', padding: 12, marginBottom: 12 }}>
            <text style={{ fontSize: 18 }}>All Time</text>
            <text>{earnings.all_time.points} points</text>
            <text>₦{earnings.all_time.amount_fiat / 100}</text>
          </view>
        </view>
      ) : null}
      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
