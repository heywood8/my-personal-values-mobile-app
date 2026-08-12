CREATE TABLE `app_metadata` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY,
	`assessed_on` text NOT NULL CONSTRAINT `idx_assessments_date` UNIQUE,
	`scale` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_values` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL CONSTRAINT `idx_personal_values_key` UNIQUE,
	`group_key` text NOT NULL,
	`is_custom` integer DEFAULT 0 NOT NULL,
	`custom_name` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` text PRIMARY KEY,
	`assessment_id` text NOT NULL,
	`value_id` text NOT NULL,
	`score` integer NOT NULL,
	`normalized` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_ratings_assessment_id_assessments_id_fk` FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ratings_value_id_personal_values_id_fk` FOREIGN KEY (`value_id`) REFERENCES `personal_values`(`id`) ON DELETE CASCADE,
	CONSTRAINT `idx_ratings_assessment_value` UNIQUE(`assessment_id`,`value_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_personal_values_group` ON `personal_values` (`group_key`);--> statement-breakpoint
CREATE INDEX `idx_personal_values_order` ON `personal_values` (`display_order`);--> statement-breakpoint
CREATE INDEX `idx_ratings_assessment` ON `ratings` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `idx_ratings_value` ON `ratings` (`value_id`);