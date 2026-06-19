ALTER TABLE `billing_checkouts` ADD `plan_id` text DEFAULT 'esencial' NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_checkouts` ADD `kind` text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_checkouts` ADD `amount_cop` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `plan_id` text DEFAULT 'esencial' NOT NULL;