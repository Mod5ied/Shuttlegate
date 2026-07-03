import { useEffect, useState } from '@lynx-js/react'
import { apiPost, generateIdempotencyKey } from '../api/client.js'
import { setAuth } from '../store/auth.js'
import {
  normalizePhone,
  type OtpRequestBody,
  type OtpVerifyBody,
  type TokenResponse,
} from '@shuttlegate/types'

interface VerifyScreenProps {
  phone: string
  onVerified: () => void
}

export function VerifyScreen({ phone, onVerified }: VerifyScreenProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    const requestOtp = async () => {
      const body: OtpRequestBody = { phone }
      await apiPost('/auth/otp/request', body, {
        idempotencyKey: generateIdempotencyKey(),
      })
      setRequested(true)
    }
    requestOtp()
  }, [phone])

  const handleVerify = async () => {
    setLoading(true)
    setError('')

    const normalizedPhone = normalizePhone(phone)
    const body: OtpVerifyBody = { phone: normalizedPhone, code }
    const result = await apiPost<TokenResponse>('/auth/otp/verify', body, {
      idempotencyKey: generateIdempotencyKey(),
    })

    setLoading(false)
    if (result.ok) {
      const data = result.data as TokenResponse
      await setAuth({ token: data.token, user: data.user })
      onVerified()
    } else {
      setError(String((result.data as { error?: string }).error ?? 'Verify failed'))
    }
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Verify OTP</text>
      <text>Code sent to {phone}</text>
      {requested ? <text style={{ marginBottom: 12 }}>Check the API log for the dev OTP.</text> : null}

      <text>OTP</text>
      <input
        type='digit'
        maxlength={6}
        bindinput={(e) => setCode(e.detail.value)}
        style={{ borderWidth: 1, padding: 8, marginBottom: 12 }}
      />

      {error ? <text style={{ color: 'red', marginBottom: 12 }}>{error}</text> : null}

      <view bindtap={handleVerify} style={{ backgroundColor: '#007AFF', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Verifying...' : 'Verify'}
        </text>
      </view>
    </view>
  )
}
