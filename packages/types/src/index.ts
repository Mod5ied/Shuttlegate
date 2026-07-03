import { z } from 'zod'

export const Role = z.enum(['student', 'driver'])
export type Role = z.infer<typeof Role>

export function normalizePhone(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, '')
  // ponytail: minimal E.164 normalization: ensure leading +, reject non-digits/+.
  const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed}`
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
    throw new Error('Invalid phone number')
  }
  return withPlus
}

const Phone = z
  .string()
  .transform((val, ctx) => {
    try {
      return normalizePhone(val)
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone must be a valid E.164 number (e.g. +2348012345678)',
      })
      return z.NEVER
    }
  })

export const SessionType = z.enum(['temporary', 'long_running'])
export type SessionType = z.infer<typeof SessionType>

export const SessionStatus = z.enum(['active', 'closed'])
export type SessionStatus = z.infer<typeof SessionStatus>

export const TransactionType = z.enum(['payment', 'refund'])
export type TransactionType = z.infer<typeof TransactionType>

export const BatchStatus = z.enum(['instant', 'pending_batch', 'completed'])
export type BatchStatus = z.infer<typeof BatchStatus>

// --- DB row shapes ---

export const User = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  role: Role,
  created_at: z.string().datetime(),
})
export type User = z.infer<typeof User>

export const Wallet = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  points: z.number().int(),
  updated_at: z.string().datetime(),
})
export type Wallet = z.infer<typeof Wallet>

export const PaymentSession = z.object({
  id: z.string().uuid(),
  driver_id: z.string().uuid(),
  type: SessionType,
  fare_points: z.number().int(),
  capacity: z.number().int(),
  batch_count: z.number().int(),
  batch_epoch: z.number().int(),
  status: SessionStatus,
  expires_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
})
export type PaymentSession = z.infer<typeof PaymentSession>

export const Transaction = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  from_user_id: z.string().uuid(),
  to_user_id: z.string().uuid(),
  points: z.number().int(),
  type: TransactionType,
  batch_status: BatchStatus,
  batch_epoch: z.number().int(),
  idempotency_key: z.string().uuid(),
  created_at: z.string().datetime(),
})
export type Transaction = z.infer<typeof Transaction>

export const TopupStatus = z.enum(['pending', 'confirmed', 'failed'])
export type TopupStatus = z.infer<typeof TopupStatus>

export const Topup = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  amount_fiat: z.number().int(),
  amount_points: z.number().int(),
  provider_ref: z.string(),
  status: TopupStatus,
  created_at: z.string().datetime(),
})
export type Topup = z.infer<typeof Topup>

export const RefundReason = z.enum(['breakdown', 'other'])
export type RefundReason = z.infer<typeof RefundReason>

export const RefundStatus = z.enum(['completed'])
export type RefundStatus = z.infer<typeof RefundStatus>

export const Refund = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  student_id: z.string().uuid(),
  points: z.number().int(),
  reason: RefundReason,
  status: RefundStatus,
  created_at: z.string().datetime(),
})
export type Refund = z.infer<typeof Refund>

export const CashoutStatus = z.enum(['pending', 'processed', 'failed'])
export type CashoutStatus = z.infer<typeof CashoutStatus>

export const Cashout = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  points: z.number().int(),
  amount_fiat: z.number().int(),
  destination: z.string(),
  status: CashoutStatus,
  created_at: z.string().datetime(),
})
export type Cashout = z.infer<typeof Cashout>

// --- Auth ---

export const RegisterBody = z.object({
  name: z.string().min(1).max(100),
  phone: Phone,
  role: Role,
})
export type RegisterBody = z.infer<typeof RegisterBody>

export const OtpRequestBody = z.object({
  phone: Phone,
})
export type OtpRequestBody = z.infer<typeof OtpRequestBody>

export const OtpVerifyBody = z.object({
  phone: Phone,
  code: z.string().length(6).regex(/^\d+$/),
})
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>

export const TokenResponse = z.object({
  token: z.string(),
  user: User,
})
export type TokenResponse = z.infer<typeof TokenResponse>

// --- Sessions ---

export const SessionCreateBody = z.object({
  type: SessionType,
  fare_points: z.number().int().positive().max(100_000),
  capacity: z.number().int().positive().max(60),
})
export type SessionCreateBody = z.infer<typeof SessionCreateBody>

export const SessionResponse = PaymentSession
export type SessionResponse = z.infer<typeof SessionResponse>

export const QrDataResponse = z.object({
  session_id: z.string().uuid(),
  type: SessionType,
  fare_points: z.number().int(),
})
export type QrDataResponse = z.infer<typeof QrDataResponse>

// --- Payments ---

export const ScanBody = z.object({
  session_id: z.string().uuid(),
})
export type ScanBody = z.infer<typeof ScanBody>

export const ScanResponse = z.object({
  message: z.string(),
  transaction_id: z.string().uuid().optional(),
})
export type ScanResponse = z.infer<typeof ScanResponse>

// --- Wallet ---

export const TopupInitiateBody = z.object({
  amount_fiat: z.number().int().positive(),
})
export type TopupInitiateBody = z.infer<typeof TopupInitiateBody>

// --- Refunds ---

export const RefundIssueBody = z.object({
  transaction_id: z.string().uuid(),
  reason: RefundReason,
})
export type RefundIssueBody = z.infer<typeof RefundIssueBody>

export const RefundResponse = Refund
export type RefundResponse = z.infer<typeof RefundResponse>

// --- Driver ---

export const CashoutBody = z.object({
  points: z.number().int().positive().max(100_000),
  destination: z.string().min(1).max(200),
})
export type CashoutBody = z.infer<typeof CashoutBody>

export const CashoutResponse = Cashout
export type CashoutResponse = z.infer<typeof CashoutResponse>

export const EarningsSummary = z.object({
  points: z.number().int(),
  amount_fiat: z.number().int(),
})
export type EarningsSummary = z.infer<typeof EarningsSummary>

export const EarningsResponse = z.object({
  today: EarningsSummary,
  all_time: EarningsSummary,
})
export type EarningsResponse = z.infer<typeof EarningsResponse>

export const TopupInitiateResponse = z.object({
  topup_id: z.string().uuid(),
  payment_link: z.string().url(),
})
export type TopupInitiateResponse = z.infer<typeof TopupInitiateResponse>

// --- Shared ---

export const IdempotencyKey = z.string().uuid()
export type IdempotencyKey = z.infer<typeof IdempotencyKey>

export const ErrorResponse = z.object({
  error: z.string(),
})
export type ErrorResponse = z.infer<typeof ErrorResponse>
