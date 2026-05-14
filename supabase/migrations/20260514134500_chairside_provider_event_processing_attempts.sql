create table "public"."provider_event_processing_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "provider_event_id" uuid not null,
    "clinic_id" uuid,
    "processor" text not null,
    "action" text not null,
    "status" text not null default 'started'::text,
    "started_at" timestamp with time zone not null default now(),
    "finished_at" timestamp with time zone,
    "idempotency_key" text,
    "result" jsonb,
    "error_message" text,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."provider_event_processing_attempts" enable row level security;

CREATE INDEX provider_event_attempts_clinic_started_at_idx ON public.provider_event_processing_attempts USING btree (clinic_id, started_at DESC);

CREATE UNIQUE INDEX provider_event_attempts_idempotency_key_idx ON public.provider_event_processing_attempts USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX provider_event_attempts_processor_action_started_at_idx ON public.provider_event_processing_attempts USING btree (processor, action, started_at DESC);

CREATE INDEX provider_event_attempts_provider_event_started_at_idx ON public.provider_event_processing_attempts USING btree (provider_event_id, started_at DESC);

CREATE UNIQUE INDEX provider_event_processing_attempts_pkey ON public.provider_event_processing_attempts USING btree (id);

CREATE INDEX provider_event_attempts_status_started_at_idx ON public.provider_event_processing_attempts USING btree (status, started_at DESC);

alter table "public"."provider_event_processing_attempts" add constraint "provider_event_processing_attempts_pkey" PRIMARY KEY using index "provider_event_processing_attempts_pkey";

alter table "public"."provider_event_processing_attempts" add constraint "provider_event_processing_attempts_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL not valid;

alter table "public"."provider_event_processing_attempts" validate constraint "provider_event_processing_attempts_clinic_id_fkey";

alter table "public"."provider_event_processing_attempts" add constraint "provider_event_processing_attempts_provider_event_id_fkey" FOREIGN KEY (provider_event_id) REFERENCES public.provider_events(id) ON DELETE CASCADE not valid;

alter table "public"."provider_event_processing_attempts" validate constraint "provider_event_processing_attempts_provider_event_id_fkey";

alter table "public"."provider_event_processing_attempts" add constraint "provider_event_processing_attempts_status_check" CHECK ((status = ANY (ARRAY['started'::text, 'succeeded'::text, 'failed'::text, 'ignored'::text]))) not valid;

alter table "public"."provider_event_processing_attempts" validate constraint "provider_event_processing_attempts_status_check";

grant all on table "public"."provider_event_processing_attempts" to anon;

grant all on table "public"."provider_event_processing_attempts" to authenticated;

grant all on table "public"."provider_event_processing_attempts" to service_role;

create policy "Clinic members can view provider event attempts"
on "public"."provider_event_processing_attempts"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
