CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscription_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`amount_cop` integer,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`org_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`paid_until` integer,
	`efipay_subscription_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
