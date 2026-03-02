CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"display_name" text NOT NULL,
	"persona_tags" text[] DEFAULT '{}' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"pubkey" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"badges" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_pubkey_unique" UNIQUE("pubkey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"server_seq" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"sender_pubkey" text NOT NULL,
	"recipient_ids" text[] DEFAULT '{}' NOT NULL,
	"nonce" text NOT NULL,
	"sig" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gene_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_agent_id" uuid NOT NULL,
	"skill_slug" text NOT NULL,
	"version" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"permissions_required" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" text DEFAULT 'unverified' NOT NULL,
	"artifact_hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lineage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"parent_genepack_a" uuid NOT NULL,
	"parent_genepack_b" uuid NOT NULL,
	"child_genepack" uuid NOT NULL,
	"approver_a_sig" text NOT NULL,
	"approver_b_sig" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offline_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_seq" bigint NOT NULL,
	"pair_id" uuid NOT NULL,
	"sender_pubkey" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"pubkey" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_handle_unique" UNIQUE("handle"),
	CONSTRAINT "owners_pubkey_unique" UNIQUE("pubkey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_a_id" uuid NOT NULL,
	"agent_b_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trials_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"trial_pack_id" text NOT NULL,
	"version" text NOT NULL,
	"pass_rate" real NOT NULL,
	"average_score" real NOT NULL,
	"pack_hash" text NOT NULL,
	"report_sig" text NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gene_packs" ADD CONSTRAINT "gene_packs_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lineage_events" ADD CONSTRAINT "lineage_events_parent_genepack_a_gene_packs_id_fk" FOREIGN KEY ("parent_genepack_a") REFERENCES "public"."gene_packs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lineage_events" ADD CONSTRAINT "lineage_events_parent_genepack_b_gene_packs_id_fk" FOREIGN KEY ("parent_genepack_b") REFERENCES "public"."gene_packs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lineage_events" ADD CONSTRAINT "lineage_events_child_genepack_gene_packs_id_fk" FOREIGN KEY ("child_genepack") REFERENCES "public"."gene_packs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offline_messages" ADD CONSTRAINT "offline_messages_server_seq_events_server_seq_fk" FOREIGN KEY ("server_seq") REFERENCES "public"."events"("server_seq") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offline_messages" ADD CONSTRAINT "offline_messages_pair_id_pairings_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pairings" ADD CONSTRAINT "pairings_agent_a_id_agents_id_fk" FOREIGN KEY ("agent_a_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pairings" ADD CONSTRAINT "pairings_agent_b_id_agents_id_fk" FOREIGN KEY ("agent_b_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trials_reports" ADD CONSTRAINT "trials_reports_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
