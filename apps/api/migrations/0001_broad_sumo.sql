CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`body_hash` text NOT NULL,
	`created_at` text NOT NULL
);
