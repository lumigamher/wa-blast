CREATE TABLE `order_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`order_id` text NOT NULL,
	`amount_cop` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_payments_order_idx` ON `order_payments` (`order_id`);