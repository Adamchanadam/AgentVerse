-- Phase 2: Prompt Brawl tables (trials, trial_results, agent_stats)

CREATE TABLE IF NOT EXISTS "trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seed" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trial_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trial_id" uuid NOT NULL,
	"winner_agent_id" uuid NOT NULL,
	"loser_agent_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"trigger_event_id" text NOT NULL,
	"transcript_digest" text NOT NULL,
	"sig_winner" text NOT NULL,
	"sig_loser" text NOT NULL,
	"xp_winner" integer DEFAULT 100 NOT NULL,
	"xp_loser" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_results_trial_id_unique" UNIQUE("trial_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_stats" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trials" ADD CONSTRAINT "trials_pair_id_pairings_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trials" ADD CONSTRAINT "trials_created_by_agents_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trial_results" ADD CONSTRAINT "trial_results_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trial_results" ADD CONSTRAINT "trial_results_winner_agent_id_agents_id_fk" FOREIGN KEY ("winner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trial_results" ADD CONSTRAINT "trial_results_loser_agent_id_agents_id_fk" FOREIGN KEY ("loser_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_stats" ADD CONSTRAINT "agent_stats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
