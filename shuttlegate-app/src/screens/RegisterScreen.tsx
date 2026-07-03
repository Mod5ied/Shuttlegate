import { useState } from '@lynx-js/react'
import { apiPost, generateIdempotencyKey } from '../api/client.js'
import { normalizePhone, type RegisterBody, type User } from '@shuttlegate/types'

interface RegisterScreenProps {
  onRegistered: (phone: string) => void
}

export function RegisterScreen({ onRegistered }: RegisterScreenProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'student' | 'driver'>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async () => {
    setLoading(true)
    setError('')

    const normalizedPhone = normalizePhone(phone)
    const body: RegisterBody = { name, phone: normalizedPhone, role }
    const result = await apiPost<User>('/auth/register', body, {
      idempotencyKey: generateIdempotencyKey(),
    })

    setLoading(false)
    if (result.ok) {
      onRegistered(normalizedPhone)
    } else {
      setError(String((result.data as { error?: string }).error ?? 'Register failed'))
    }
  }

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, marginBottom: 20 }}>Register</text>

      <text>Name</text>
      <input
        bindinput={(e) => setName(e.detail.value)}
        style={{ borderWidth: 1, padding: 8, marginBottom: 12 }}
      />

      <text>Phone</text>
      <input
        type='tel'
        bindinput={(e) => setPhone(e.detail.value)}
        style={{ borderWidth: 1, padding: 8, marginBottom: 12 }}
      />

      <text>Role</text>
      <view style={{ flexDirection: 'row', marginBottom: 12 }}>
        <view
          bindtap={() => setRole('student')}
          style={{
            padding: 8,
            backgroundColor: role === 'student' ? '#ccc' : '#fff',
          }}
        >
          <text>Student</text>
        </view>
        <view
          bindtap={() => setRole('driver')}
          style={{
            padding: 8,
            backgroundColor: role === 'driver' ? '#ccc' : '#fff',
          }}
        >
          <text>Driver</text>
        </view>
      </view>

      {error ? <text style={{ color: 'red', marginBottom: 12 }}>{error}</text> : null}

      <view bindtap={handleRegister} style={{ backgroundColor: '#007AFF', padding: 12 }}>
        <text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Registering...' : 'Register'}
        </text>
      </view>
    </view>
  )
}
