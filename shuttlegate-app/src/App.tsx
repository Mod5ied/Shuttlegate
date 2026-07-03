import { useEffect, useState } from '@lynx-js/react'
import './App.css'
import { RegisterScreen } from './screens/RegisterScreen.js'
import { VerifyScreen } from './screens/VerifyScreen.js'
import { WalletScreen } from './screens/WalletScreen.js'
import { CreateSessionScreen } from './screens/CreateSessionScreen.js'
import { SessionDetailScreen } from './screens/SessionDetailScreen.js'
import { ScanScreen } from './screens/ScanScreen.js'
import { HistoryScreen } from './screens/HistoryScreen.js'
import { DriverHomeScreen } from './screens/DriverHomeScreen.js'
import { IssueRefundScreen } from './screens/IssueRefundScreen.js'
import { RefundDetailScreen } from './screens/RefundDetailScreen.js'
import { CashOutScreen } from './screens/CashOutScreen.js'
import { EarningsScreen } from './screens/EarningsScreen.js'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import { useAuth, initAuth } from './store/auth.js'
import type { PaymentSession } from '@shuttlegate/types'

type Screen =
  | 'register'
  | 'verify'
  | 'student-home'
  | 'driver-home'
  | 'create-session'
  | 'session-detail'
  | 'scan'
  | 'history'
  | 'issue-refund'
  | 'refund-detail'
  | 'cash-out'
  | 'earnings'

export function App() {
  const [screen, setScreen] = useState<Screen>('register')
  const [phone, setPhone] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [selectedRefundId, setSelectedRefundId] = useState('')
  const auth = useAuth()
  const { online } = useOnlineStatus()

  useEffect(() => {
    initAuth()
  }, [])

  const handleRegistered = (registeredPhone: string) => {
    setPhone(registeredPhone)
    setScreen('verify')
  }

  const handleVerified = () => {
    setScreen(auth.user?.role === 'driver' ? 'driver-home' : 'student-home')
  }

  const handleSessionCreated = (session: PaymentSession) => {
    setSelectedSessionId(session.id)
    setScreen('session-detail')
  }

  const handleRefundIssued = (id: string) => {
    setSelectedRefundId(id)
    setScreen('refund-detail')
  }

  // If already authenticated, skip to role-appropriate home
  if (auth.token && (screen === 'register' || screen === 'verify')) {
    setScreen(auth.user?.role === 'driver' ? 'driver-home' : 'student-home')
  }

  if (!auth.token) {
    if (screen === 'register') {
      return (
        <view className='container'>
          <RegisterScreen onRegistered={handleRegistered} />
        </view>
      )
    }
    if (screen === 'verify') {
      return (
        <view className='container'>
          <VerifyScreen phone={phone} onVerified={handleVerified} />
        </view>
      )
    }
    setScreen('register')
    return null
  }

  return (
    <view className='container'>
      {screen === 'student-home' && (
        <WalletScreen
          onViewHistory={() => setScreen('history')}
        />
      )}
      {screen === 'driver-home' && (
        <DriverHomeScreen
          token={auth.token}
          onCreateSession={() => setScreen('create-session')}
          onViewSession={(id) => {
            setSelectedSessionId(id)
            setScreen('session-detail')
          }}
          onViewHistory={() => setScreen('history')}
          onIssueRefund={() => setScreen('issue-refund')}
          onCashOut={() => setScreen('cash-out')}
          onViewEarnings={() => setScreen('earnings')}
        />
      )}
      {screen === 'create-session' && auth.token && (
        <CreateSessionScreen
          token={auth.token}
          onCreated={handleSessionCreated}
          onBack={() => setScreen('driver-home')}
        />
      )}
      {screen === 'session-detail' && auth.token && (
        <SessionDetailScreen
          token={auth.token}
          sessionId={selectedSessionId}
          onBack={() => setScreen(auth.user?.role === 'driver' ? 'driver-home' : 'student-home')}
        />
      )}
      {screen === 'scan' && auth.token && (
        <ScanScreen
          token={auth.token}
          onBack={() => setScreen('student-home')}
        />
      )}
      {screen === 'history' && auth.token && (
        <HistoryScreen
          token={auth.token}
          onBack={() => setScreen(auth.user?.role === 'driver' ? 'driver-home' : 'student-home')}
        />
      )}

      {screen === 'issue-refund' && auth.token && (
        <IssueRefundScreen
          token={auth.token}
          onBack={() => setScreen('driver-home')}
          onViewRefund={handleRefundIssued}
        />
      )}

      {screen === 'refund-detail' && auth.token && (
        <RefundDetailScreen
          token={auth.token}
          refundId={selectedRefundId}
          onBack={() => setScreen('driver-home')}
        />
      )}

      {screen === 'cash-out' && auth.token && (
        <CashOutScreen token={auth.token} onBack={() => setScreen('driver-home')} />
      )}

      {screen === 'earnings' && auth.token && (
        <EarningsScreen token={auth.token} onBack={() => setScreen('driver-home')} />
      )}

      {!online && (
        <view style={{ backgroundColor: '#FF3B30', padding: 10 }}>
          <text style={{ color: 'white', textAlign: 'center' }}>No internet connection</text>
        </view>
      )}

      {auth.user?.role === 'student' && screen === 'student-home' && (
        <view bindtap={() => setScreen('scan')} style={{ backgroundColor: '#34C759', padding: 12, margin: 20 }}>
          <text style={{ color: 'white', textAlign: 'center' }}>Scan & Pay</text>
        </view>
      )}
    </view>
  )
}
