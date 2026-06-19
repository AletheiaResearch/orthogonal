CREATE TABLE `broadcast_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text DEFAULT 'platform' NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sampling_rate` real DEFAULT 1 NOT NULL,
	`config` text NOT NULL,
	`secret_encrypted` text NOT NULL,
	`label` text DEFAULT 'default' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "broadcast_destinations_tenant_owner_id" CHECK("broadcast_destinations"."owner_type" = 'platform' OR "broadcast_destinations"."owner_id" <> ''),
	CONSTRAINT "broadcast_destinations_sampling_rate" CHECK("broadcast_destinations"."sampling_rate" >= 0 AND "broadcast_destinations"."sampling_rate" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcast_destinations_owner_type_label` ON `broadcast_destinations` (`owner_type`,`owner_id`,`type`,`label`);