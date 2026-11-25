ALTER TYPE "app"."entity_type" ADD VALUE 'wedding_note' BEFORE 'shagun_entry';--> statement-breakpoint
CREATE TABLE "app"."wedding_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"note_text" text NOT NULL,
	"created_by_member_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed_key" text
);
--> statement-breakpoint
ALTER TABLE "app"."wedding_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."wedding_notes" ADD CONSTRAINT "wedding_notes_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "app"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wedding_notes_wedding_created_idx" ON "app"."wedding_notes" USING btree ("wedding_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wedding_notes_seed_key_uq" ON "app"."wedding_notes" USING btree ("wedding_id","seed_key") WHERE "app"."wedding_notes"."seed_key" is not null;