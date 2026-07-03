ALTER TABLE `payment_sessions` ADD `batch_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `batch_epoch` integer DEFAULT 0 NOT NULL;