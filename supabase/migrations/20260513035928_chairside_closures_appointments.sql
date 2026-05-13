create table "public"."clinic_closures" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "date" date not null,
    "reason" text,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."clinic_closures" enable row level security;

create table "public"."appointments" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "patient_id" uuid not null,
    "service_id" uuid not null,
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone not null,
    "status" text not null default 'scheduled'::text,
    "source" text not null default 'manual'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "confirmed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" text,
    "notes" text,
    "patient_notes" text
);

alter table "public"."appointments" enable row level security;

CREATE UNIQUE INDEX clinic_closures_pkey ON public.clinic_closures USING btree (id);

CREATE UNIQUE INDEX clinic_closures_clinic_id_date_key ON public.clinic_closures USING btree (clinic_id, date);

CREATE INDEX clinic_closures_clinic_id_idx ON public.clinic_closures USING btree (clinic_id);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

CREATE INDEX appointments_clinic_starts_at_idx ON public.appointments USING btree (clinic_id, starts_at);

CREATE INDEX appointments_patient_id_idx ON public.appointments USING btree (patient_id);

CREATE INDEX appointments_clinic_status_starts_at_idx ON public.appointments USING btree (clinic_id, status, starts_at);

alter table "public"."clinic_closures" add constraint "clinic_closures_pkey" PRIMARY KEY using index "clinic_closures_pkey";

alter table "public"."appointments" add constraint "appointments_pkey" PRIMARY KEY using index "appointments_pkey";

alter table "public"."clinic_closures" add constraint "clinic_closures_clinic_id_date_key" UNIQUE using index "clinic_closures_clinic_id_date_key";

alter table "public"."appointments" add constraint "appointments_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."appointments" validate constraint "appointments_clinic_id_fkey";

alter table "public"."appointments" add constraint "appointments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."appointments" validate constraint "appointments_created_by_fkey";

alter table "public"."appointments" add constraint "appointments_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE not valid;

alter table "public"."appointments" validate constraint "appointments_patient_id_fkey";

alter table "public"."appointments" add constraint "appointments_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id) not valid;

alter table "public"."appointments" validate constraint "appointments_service_id_fkey";

alter table "public"."clinic_closures" add constraint "clinic_closures_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."clinic_closures" validate constraint "clinic_closures_clinic_id_fkey";

alter table "public"."appointments" add constraint "appointments_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'ai_voice'::text, 'ai_sms'::text, 'imported'::text]))) not valid;

alter table "public"."appointments" validate constraint "appointments_source_check";

alter table "public"."appointments" add constraint "appointments_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'reminder_sent'::text, 'confirmed'::text, 'cancelled'::text, 'needs_reschedule'::text, 'completed'::text, 'no_show'::text]))) not valid;

alter table "public"."appointments" validate constraint "appointments_status_check";

alter table "public"."appointments" add constraint "appointments_no_overlap" EXCLUDE USING gist (
    clinic_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
) WHERE ((status <> ALL (ARRAY['cancelled'::text, 'no_show'::text])));

grant all on table "public"."clinic_closures" to anon;
grant all on table "public"."clinic_closures" to authenticated;
grant all on table "public"."clinic_closures" to service_role;

grant all on table "public"."appointments" to anon;
grant all on table "public"."appointments" to authenticated;
grant all on table "public"."appointments" to service_role;

create policy "Clinic members can view closures in their clinics"
on "public"."clinic_closures"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));

create policy "Clinic members can view appointments in their clinics"
on "public"."appointments"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
