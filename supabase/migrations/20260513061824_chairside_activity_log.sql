create table "public"."chairside_activity_log" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "actor_type" text not null,
    "actor_id" uuid,
    "actor_label" text,
    "action" text not null,
    "entity_type" text,
    "entity_id" uuid,
    "details" jsonb,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."chairside_activity_log" enable row level security;

CREATE UNIQUE INDEX chairside_activity_log_pkey ON public.chairside_activity_log USING btree (id);

CREATE INDEX chairside_activity_log_clinic_created_at_idx ON public.chairside_activity_log USING btree (clinic_id, created_at DESC);

CREATE INDEX chairside_activity_log_entity_idx ON public.chairside_activity_log USING btree (entity_type, entity_id);

alter table "public"."chairside_activity_log" add constraint "chairside_activity_log_pkey" PRIMARY KEY using index "chairside_activity_log_pkey";

alter table "public"."chairside_activity_log" add constraint "chairside_activity_log_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'ai'::text, 'system'::text, 'patient'::text]))) not valid;

alter table "public"."chairside_activity_log" validate constraint "chairside_activity_log_actor_type_check";

alter table "public"."chairside_activity_log" add constraint "chairside_activity_log_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."chairside_activity_log" validate constraint "chairside_activity_log_clinic_id_fkey";

grant all on table "public"."chairside_activity_log" to anon;
grant all on table "public"."chairside_activity_log" to authenticated;
grant all on table "public"."chairside_activity_log" to service_role;

create policy "Clinic members can view Chairside activity in their clinics"
on "public"."chairside_activity_log"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
