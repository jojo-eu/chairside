create table "public"."patients" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "first_name" text not null,
    "last_name" text not null,
    "phone" text not null,
    "email" text,
    "date_of_birth" date,
    "language" text not null default 'sk'::text,
    "notes" text,
    "tags" jsonb not null default '[]'::jsonb,
    "last_visit_at" timestamp with time zone,
    "do_not_contact" boolean not null default false,
    "do_not_contact_reason" text,
    "consent_given_at" timestamp with time zone,
    "consent_source" text,
    "data_retention_until" timestamp with time zone,
    "source" text not null default 'manual'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid
);

alter table "public"."patients" enable row level security;

create table "public"."services" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "name" text not null,
    "duration_minutes" integer not null,
    "buffer_minutes" integer not null default 0,
    "color" text not null default '#3B82F6'::text,
    "description" text,
    "active" boolean not null default true,
    "display_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

alter table "public"."services" enable row level security;

CREATE UNIQUE INDEX patients_pkey ON public.patients USING btree (id);

CREATE INDEX patients_clinic_id_idx ON public.patients USING btree (clinic_id);

CREATE INDEX patients_clinic_last_visit_at_idx ON public.patients USING btree (clinic_id, last_visit_at);

CREATE UNIQUE INDEX patients_clinic_phone_idx ON public.patients USING btree (clinic_id, phone);

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);

CREATE INDEX services_clinic_id_idx ON public.services USING btree (clinic_id);

alter table "public"."patients" add constraint "patients_pkey" PRIMARY KEY using index "patients_pkey";

alter table "public"."services" add constraint "services_pkey" PRIMARY KEY using index "services_pkey";

alter table "public"."patients" add constraint "patients_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."patients" validate constraint "patients_clinic_id_fkey";

alter table "public"."patients" add constraint "patients_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."patients" validate constraint "patients_created_by_fkey";

alter table "public"."services" add constraint "services_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."services" validate constraint "services_clinic_id_fkey";

grant all on table "public"."patients" to anon;
grant all on table "public"."patients" to authenticated;
grant all on table "public"."patients" to service_role;

grant all on table "public"."services" to anon;
grant all on table "public"."services" to authenticated;
grant all on table "public"."services" to service_role;

create policy "Clinic members can view patients in their clinics"
on "public"."patients"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));

create policy "Clinic members can view services in their clinics"
on "public"."services"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
