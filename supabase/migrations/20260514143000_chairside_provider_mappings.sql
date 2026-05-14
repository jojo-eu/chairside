create table "public"."provider_mappings" (
    "id" uuid not null default gen_random_uuid(),
    "clinic_id" uuid not null,
    "provider" text not null,
    "mapping_type" text not null,
    "provider_identifier" text not null,
    "label" text,
    "active" boolean not null default true,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."provider_mappings" enable row level security;

CREATE INDEX provider_mappings_clinic_id_idx ON public.provider_mappings USING btree (clinic_id);

CREATE INDEX provider_mappings_clinic_provider_active_idx ON public.provider_mappings USING btree (clinic_id, provider, active);

CREATE UNIQUE INDEX provider_mappings_pkey ON public.provider_mappings USING btree (id);

CREATE UNIQUE INDEX provider_mappings_provider_mapping_type_identifier_key ON public.provider_mappings USING btree (provider, mapping_type, provider_identifier);

alter table "public"."provider_mappings" add constraint "provider_mappings_pkey" PRIMARY KEY using index "provider_mappings_pkey";

alter table "public"."provider_mappings" add constraint "provider_mappings_provider_mapping_type_identifier_key" UNIQUE using index "provider_mappings_provider_mapping_type_identifier_key";

alter table "public"."provider_mappings" add constraint "provider_mappings_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."provider_mappings" validate constraint "provider_mappings_clinic_id_fkey";

alter table "public"."provider_mappings" add constraint "provider_mappings_mapping_type_check" CHECK ((mapping_type = ANY (ARRAY['phone_number'::text, 'assistant_id'::text, 'account_id'::text, 'messaging_profile_id'::text, 'webhook_secret_id'::text, 'other'::text]))) not valid;

alter table "public"."provider_mappings" validate constraint "provider_mappings_mapping_type_check";

alter table "public"."provider_mappings" add constraint "provider_mappings_provider_check" CHECK ((provider = ANY (ARRAY['telnyx'::text, 'vapi'::text, 'system'::text, 'manual'::text]))) not valid;

alter table "public"."provider_mappings" validate constraint "provider_mappings_provider_check";

grant all on table "public"."provider_mappings" to anon;

grant all on table "public"."provider_mappings" to authenticated;

grant all on table "public"."provider_mappings" to service_role;

create policy "Clinic members can view provider mappings in their clinics"
on "public"."provider_mappings"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
