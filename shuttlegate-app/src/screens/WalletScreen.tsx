import { useEffect, useState } from '@lynx-js/react'
import { apiGet, apiPost, generateIdempotencyKey } from '../api/client.js'
import { getAuth, setAuth } from '../store/auth.js'
import { useOnlineStatus } from '../hooks/useOnlineStatus.js'
import type { Wallet, TopupInitiateResponse } from '@shuttlegate/types'

interface WalletScreenProps {
  onViewHistory: () => void
}

export function WalletScreen({ onViewHistory }: WalletScreenProps) {
  const auth = getAuth()
  const [balance, setBalance] = useState(0)
  const [lastBalance, setLastBalance] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { online, markOffline } = useOnlineStatus()

  const fetchBalance = async () => {
    if (!auth.token) return
    try {
      const result = await apiGet<Wallet>('/wallet/balance', auth.token)
      if (result.ok) {
        const points = (result.data as Wallet).points
        setBalance(points)
        setLastBalance(points)
      }
    } catch {
      markOffline()
    }
  }

  useEffect(() => {
    fetchBalance()
  }, [])

  const handleTopup = async () => {
    if (!auth.token) return
    if (!online) {
      setMessage('You are offline. Please reconnect to top up.')
      return
    }
    setLoading(true)
    setMessage('')

    const result = await apiPost<TopupInitiateResponse>(
      '/wallet/topup/initiate',
      { amount_fiat: 100000 },
      { token: auth.token, idempotencyKey: generateIdempotencyKey() },
    )

    setLoading(false)
    if (result.ok) {
      const data = result.data as TopupInitiateResponse
      setMessage(`Top-up started. Complete payment, then webhook will credit wallet.`)
      console.info('Payment link:', data.payment_link)
    } else {
      setMessage(String((result.data as { error?: string }).error ?? 'Top-up failed'))
    }
  }

  const handleLogout = async () => {
    await setAuth({ token: null, user: null })
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Wallet</text>
      {!online && lastBalance > 0 ? (
        <text style={{ fontSize: 18, marginBottom: 12 }}>
          Balance (last known): {lastBalance} points
        </text>
      ) : (
        <text style={{ fontSize: 18, marginBottom: 12 }}>
          Balance: {balance} points
        </text>
      )}
      <text style={{ marginBottom: 20 }}>
        User: {auth.user?.name} ({auth.user?.role})
      </text>

      {message ? <text style={{ marginBottom: 12 }}>{message}</text> : null}

      <view bindtap={handleTopup} style={{ backgroundColor: '#34C759', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Starting...' : 'Top Up ₦1,000'}
        </text>
      </view>

      <view bindtap={fetchBalance} style={{ backgroundColor: '#5856D6', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Refresh Balance</text>
      </view>

      <view bindtap={onViewHistory} style={{ backgroundColor: '#FF9500', padding: 12, marginBottom: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>History</text>
      </view>

      <view bindtap={handleLogout} style={{ backgroundColor: '#FF3B30', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Logout</text>
      </view>
    </view>
  )
}
