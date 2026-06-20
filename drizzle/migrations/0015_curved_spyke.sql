CREATE TABLE `agent_configs` (
	`org_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`name` text DEFAULT 'Asistente' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`model` text DEFAULT 'gpt-5-mini' NOT NULL,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`business_hours_json` text,
	`fallback_message` text DEFAULT 'En un momento te atiende una persona del equipo.' NOT NULL,
	`max_steps_per_turn` integer DEFAULT 5 NOT NULL,
	`monthly_cost_cap_cop` integer,
	`template_id` text,
	`advanced_mode` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text,
	`steps_json` text DEFAULT '[]' NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cost_cop` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_runs_org_idx` ON `agent_runs` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_tools` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_tools_org_idx` ON `agent_tools` (`org_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `agent_paused` integer DEFAULT false NOT NULL;