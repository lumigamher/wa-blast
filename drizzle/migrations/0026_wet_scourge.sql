CREATE TABLE `ai_gateway` (
	`org_id` text PRIMARY KEY NOT NULL,
	`chat_provider` text DEFAULT 'openai' NOT NULL,
	`chat_model` text DEFAULT 'gpt-5-mini' NOT NULL,
	`openai_key_enc` text,
	`anthropic_key_enc` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
