create table "public"."provider_events" (
    "id" uuid not null default gen_random_uuid(),
    "clinic_id" uuid,
    "provider" text not null,
    "provider_event_id" text not null,
    "event_type" text not null,
    "resource_type" text,
    "resource_id" text,
    "received_at" timestamp with time zone not null default now(),
    "processed_at" timestamp with time zone,
    "processing_status" text not null default 'received'::text,
    "payload" jsonb not null,
    "error_message" text,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."provider_events" enable row level security;

CREATE INDEX provider_events_clinic_received_at_idx ON public.provider_events USING btree (clinic_id, received_at DESC);

CREATE INDEX provider_events_event_type_idx ON public.provider_events USING btree (event_type);

CREATE INDEX provider_events_processing_status_received_at_idx ON public.provider_events USING btree (processing_status, received_at);

CREATE UNIQUE INDEX provider_events_provider_event_id_key ON public.provider_events USING btree (provider, provider_event_id);

CREATE UNIQUE INDEX provider_events_pkey ON public.provider_events USING btree (id);

alter table "public"."provider_events" add constraint "provider_events_pkey" PRIMARY KEY using index "provider_events_pkey";

alter table "public"."provider_events" add constraint "provider_events_provider_event_id_key" UNIQUE using index "provider_events_provider_event_id_key";

alter table "public"."provider_events" add constraint "provider_events_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL not valid;

alter table "public"."provider_events" validate constraint "provider_events_clinic_id_fkey";

alter table "public"."provider_events" add constraint "provider_events_processing_status_check" CHECK ((processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'ignored'::text, 'failed'::text]))) not valid;

alter table "public"."provider_events" validate constraint "provider_events_processing_status_check";

alter table "public"."provider_events" add constraint "provider_events_provider_check" CHECK ((provider = ANY (ARRAY['telnyx'::text, 'vapi'::text, 'system'::text, 'manual'::text]))) not valid;

alter table "public"."provider_events" validate constraint "provider_events_provider_check";

grant all on table "public"."provider_events" to anon;

grant all on table "public"."provider_events" to authenticated;

grant all on table "public"."provider_events" to service_role;

create policy "Clinic members can view provider events in their clinics"
on "public"."provider_events"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
