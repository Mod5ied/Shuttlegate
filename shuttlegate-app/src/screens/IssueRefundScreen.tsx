import { useEffect, useState } from '@lynx-js/react'
import { apiGet, apiPost, generateIdempotencyKey } from '../api/client.js'
import { getAuth } from '../store/auth.js'
import type { Transaction, RefundReason } from '@shuttlegate/types'

interface IssueRefundScreenProps {
  token: string
  onBack: () => void
  onViewRefund?: (id: string) => void
}

export function IssueRefundScreen({ token, onBack, onViewRefund }: IssueRefundScreenProps) {
  const auth = getAuth()
  const [transactions, setTransactions] = useState<Array<Transaction & { from_name?: string; to_name?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await apiGet<{ transactions: Array<Transaction & { from_name?: string; to_name?: string }> }>(
      '/payment/history',
      token,
    )
    if (res.ok) {
      const all = (res.data as { transactions: Array<Transaction & { from_name?: string; to_name?: string }> }).transactions
      setTransactions(
        all.filter(
          (t) =>
            t.to_user_id === auth.user?.id &&
            t.type === 'payment' &&
            (t.batch_status === 'instant' || t.batch_status === 'completed'),
        ),
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  const issueRefund = async (transaction: Transaction & { from_name?: string }) => {
    setMessage('')
    const res = await apiPost<{ id: string }>(
      '/refund/issue',
      { transaction_id: transaction.id, reason: 'other' as RefundReason },
      { token, idempotencyKey: generateIdempotencyKey() },
    )
    if (res.ok) {
      setMessage('Refund issued')
      const data = res.data as { id: string }
      onViewRefund?.(data.id)
    } else {
      setMessage(String((res.data as { error?: string }).error ?? 'Refund failed'))
    }
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Issue Refund</text>
      {loading ? <text>Loading...</text> : null}
      {message ? <text style={{ marginBottom: 12 }}>{message}</text> : null}

      {transactions.map((tx) => (
        <view
          key={tx.id}
          bindtap={() => issueRefund(tx)}
          style={{ backgroundColor: '#fff', padding: 12, marginBottom: 8 }}
        >
          <text>{tx.points} points from {tx.from_name}</text>
          <text style={{ fontSize: 10, color: '#666' }}>{tx.created_at}</text>
          <text style={{ color: '#007AFF', marginTop: 4 }}>Tap to refund</text>
        </view>
      ))}

      <view bindtap={onBack} style={{ backgroundColor: '#8E8E93', padding: 12, marginTop: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>Back</text>
      </view>
    </view>
  )
}
