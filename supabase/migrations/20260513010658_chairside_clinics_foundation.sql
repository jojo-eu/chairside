create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "btree_gist" with schema "extensions";

create table "public"."clinics" (
    "id" uuid default gen_random_uuid() not null,
    "name" text not null,
    "slug" text not null,
    "phone" text,
    "email" text,
    "address" jsonb,
    "timezone" text not null default 'Europe/Bratislava'::text,
    "language" text not null default 'sk'::text,
    "subscription_tier" text not null default 'tier1'::text,
    "subscription_status" text not null default 'trial'::text,
    "config" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

alter table "public"."clinics" enable row level security;

create table "public"."clinic_members" (
    "id" uuid default gen_random_uuid() not null,
    "user_id" uuid not null,
    "clinic_id" uuid not null,
    "role" text not null,
    "full_name" text,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."clinic_members" enable row level security;

CREATE UNIQUE INDEX clinic_members_pkey ON public.clinic_members USING btree (id);

CREATE INDEX clinic_members_clinic_id_idx ON public.clinic_members USING btree (clinic_id);

CREATE INDEX clinic_members_user_id_idx ON public.clinic_members USING btree (user_id);

CREATE UNIQUE INDEX clinic_members_user_id_clinic_id_key ON public.clinic_members USING btree (user_id, clinic_id);

CREATE UNIQUE INDEX clinics_pkey ON public.clinics USING btree (id);

CREATE UNIQUE INDEX clinics_slug_key ON public.clinics USING btree (slug);

alter table "public"."clinic_members" add constraint "clinic_members_pkey" PRIMARY KEY using index "clinic_members_pkey";

alter table "public"."clinics" add constraint "clinics_pkey" PRIMARY KEY using index "clinics_pkey";

alter table "public"."clinic_members" add constraint "clinic_members_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."clinic_members" validate constraint "clinic_members_clinic_id_fkey";

alter table "public"."clinic_members" add constraint "clinic_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'receptionist'::text, 'dentist'::text, 'super_admin'::text]))) not valid;

alter table "public"."clinic_members" validate constraint "clinic_members_role_check";

alter table "public"."clinic_members" add constraint "clinic_members_user_id_clinic_id_key" UNIQUE using index "clinic_members_user_id_clinic_id_key";

alter table "public"."clinic_members" add constraint "clinic_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."clinic_members" validate constraint "clinic_members_user_id_fkey";

alter table "public"."clinics" add constraint "clinics_slug_key" UNIQUE using index "clinics_slug_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION "public"."current_clinic_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" SECURITY DEFINER STABLE
    SET "search_path" TO 'public'
    AS $$
    select clinic_id
    from public.clinic_members
    where user_id = auth.uid();
$$;

grant all on function public.current_clinic_ids() to anon;
grant all on function public.current_clinic_ids() to authenticated;
grant all on function public.current_clinic_ids() to service_role;

grant all on table "public"."clinics" to anon;
grant all on table "public"."clinics" to authenticated;
grant all on table "public"."clinics" to service_role;

grant all on table "public"."clinic_members" to anon;
grant all on table "public"."clinic_members" to authenticated;
grant all on table "public"."clinic_members" to service_role;

create policy "Clinic members can view their clinics"
on "public"."clinics"
as permissive
for select
to authenticated
using ((id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));

create policy "Clinic members can view memberships in their clinics"
on "public"."clinic_members"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
