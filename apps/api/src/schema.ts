import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  role: text('role', { enum: ['student', 'driver'] }).notNull(),
  created_at: text('created_at').notNull(),
})

export const wallets = sqliteTable('wallets', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id),
  points: integer('points').notNull().default(0),
  updated_at: text('updated_at').notNull(),
})

export const idempotency_keys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  body_hash: text('body_hash').notNull(),
  created_at: text('created_at').notNull(),
})

export const otp_attempts = sqliteTable('otp_attempts', {
  phone: text('phone').primaryKey(),
  count: integer('count').notNull().default(0),
  updated_at: text('updated_at').notNull(),
})

export const payment_sessions = sqliteTable('payment_sessions', {
  id: text('id').primaryKey(),
  driver_id: text('driver_id')
    .notNull()
    .references(() => users.id),
  type: text('type', { enum: ['temporary', 'long_running'] }).notNull(),
  fare_points: integer('fare_points').notNull(),
  capacity: integer('capacity').notNull(),
  batch_count: integer('batch_count').notNull().default(0),
  batch_epoch: integer('batch_epoch').notNull().default(0),
  status: text('status', { enum: ['active', 'closed'] }).notNull(),
  expires_at: text('expires_at'),
  created_at: text('created_at').notNull(),
})

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  session_id: text('session_id')
    .notNull()
    .references(() => payment_sessions.id),
  from_user_id: text('from_user_id')
    .notNull()
    .references(() => users.id),
  to_user_id: text('to_user_id')
    .notNull()
    .references(() => users.id),
  points: integer('points').notNull(),
  type: text('type', { enum: ['payment', 'refund'] }).notNull(),
  batch_status: text('batch_status', {
    enum: ['instant', 'pending_batch', 'completed'],
  }).notNull(),
  batch_epoch: integer('batch_epoch').notNull().default(0),
  idempotency_key: text('idempotency_key').notNull().unique(),
  created_at: text('created_at').notNull(),
})

export const topups = sqliteTable('topups', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id),
  amount_fiat: integer('amount_fiat').notNull(),
  amount_points: integer('amount_points').notNull(),
  provider_ref: text('provider_ref').notNull().unique(),
  status: text('status', { enum: ['pending', 'confirmed', 'failed'] }).notNull(),
  created_at: text('created_at').notNull(),
})

export const refunds = sqliteTable('refunds', {
  id: text('id').primaryKey(),
  transaction_id: text('transaction_id')
    .notNull()
    .references(() => transactions.id)
    .unique(),
  driver_id: text('driver_id')
    .notNull()
    .references(() => users.id),
  student_id: text('student_id')
    .notNull()
    .references(() => users.id),
  points: integer('points').notNull(),
  reason: text('reason', { enum: ['breakdown', 'other'] }).notNull(),
  status: text('status', { enum: ['completed'] }).notNull(),
  created_at: text('created_at').notNull(),
})

export const cashouts = sqliteTable('cashouts', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id),
  points: integer('points').notNull(),
  amount_fiat: integer('amount_fiat').notNull(),
  destination: text('destination').notNull(),
  status: text('status', { enum: ['pending', 'processed', 'failed'] }).notNull(),
  created_at: text('created_at').notNull(),
})
