create table "public"."call_logs" (
    "id" uuid not null default gen_random_uuid(),
    "clinic_id" uuid not null,
    "patient_id" uuid,
    "appointment_id" uuid,
    "direction" text not null,
    "phone" text not null,
    "provider" text not null,
    "provider_call_id" text,
    "status" text not null,
    "outcome" text not null default 'unknown'::text,
    "started_at" timestamp with time zone not null,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "transcript" text,
    "summary" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "needs_review" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."call_logs" enable row level security;

CREATE INDEX call_logs_appointment_id_idx ON public.call_logs USING btree (appointment_id);

CREATE INDEX call_logs_clinic_needs_review_idx ON public.call_logs USING btree (clinic_id, needs_review);

CREATE INDEX call_logs_clinic_started_at_idx ON public.call_logs USING btree (clinic_id, started_at DESC);

CREATE INDEX call_logs_patient_id_idx ON public.call_logs USING btree (patient_id);

CREATE INDEX call_logs_provider_call_id_idx ON public.call_logs USING btree (provider_call_id);

CREATE UNIQUE INDEX call_logs_pkey ON public.call_logs USING btree (id);

alter table "public"."call_logs" add constraint "call_logs_pkey" PRIMARY KEY using index "call_logs_pkey";

alter table "public"."call_logs" add constraint "call_logs_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) not valid;

alter table "public"."call_logs" validate constraint "call_logs_appointment_id_fkey";

alter table "public"."call_logs" add constraint "call_logs_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."call_logs" validate constraint "call_logs_clinic_id_fkey";

alter table "public"."call_logs" add constraint "call_logs_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) not valid;

alter table "public"."call_logs" validate constraint "call_logs_direction_check";

alter table "public"."call_logs" add constraint "call_logs_outcome_check" CHECK ((outcome = ANY (ARRAY['booked'::text, 'needs_reschedule'::text, 'cancelled'::text, 'answered_question'::text, 'no_action'::text, 'failed'::text, 'unknown'::text]))) not valid;

alter table "public"."call_logs" validate constraint "call_logs_outcome_check";

alter table "public"."call_logs" add constraint "call_logs_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) not valid;

alter table "public"."call_logs" validate constraint "call_logs_patient_id_fkey";

alter table "public"."call_logs" add constraint "call_logs_provider_check" CHECK ((provider = ANY (ARRAY['vapi'::text, 'telnyx'::text, 'manual'::text, 'system'::text]))) not valid;

alter table "public"."call_logs" validate constraint "call_logs_provider_check";

alter table "public"."call_logs" add constraint "call_logs_status_check" CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'missed'::text]))) not valid;

alter table "public"."call_logs" validate constraint "call_logs_status_check";

grant all on table "public"."call_logs" to anon;

grant all on table "public"."call_logs" to authenticated;

grant all on table "public"."call_logs" to service_role;

create policy "Clinic members can view call logs in their clinics"
on "public"."call_logs"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));

