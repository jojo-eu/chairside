create table "public"."reminders" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "appointment_id" uuid not null,
    "patient_id" uuid not null,
    "scheduled_for" timestamp with time zone not null,
    "sent_at" timestamp with time zone,
    "status" text not null default 'pending'::text,
    "channel" text not null default 'sms'::text,
    "template_key" text not null,
    "response_status" text,
    "response_received_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

alter table "public"."reminders" enable row level security;

create table "public"."messages" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "patient_id" uuid,
    "appointment_id" uuid,
    "reminder_id" uuid,
    "direction" text not null,
    "channel" text not null default 'sms'::text,
    "provider" text,
    "provider_message_id" text,
    "body" text not null,
    "status" text not null default 'pending'::text,
    "sent_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."messages" enable row level security;

create table "public"."opt_outs" (
    "id" uuid default gen_random_uuid() not null,
    "clinic_id" uuid not null,
    "patient_id" uuid,
    "phone" text not null,
    "channel" text not null default 'sms'::text,
    "reason" text,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."opt_outs" enable row level security;

CREATE UNIQUE INDEX reminders_pkey ON public.reminders USING btree (id);

CREATE INDEX reminders_clinic_id_idx ON public.reminders USING btree (clinic_id);

CREATE INDEX reminders_appointment_id_idx ON public.reminders USING btree (appointment_id);

CREATE INDEX reminders_clinic_scheduled_for_idx ON public.reminders USING btree (clinic_id, scheduled_for);

CREATE INDEX reminders_clinic_status_idx ON public.reminders USING btree (clinic_id, status);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE INDEX messages_clinic_id_idx ON public.messages USING btree (clinic_id);

CREATE INDEX messages_patient_id_idx ON public.messages USING btree (patient_id);

CREATE INDEX messages_appointment_id_idx ON public.messages USING btree (appointment_id);

CREATE INDEX messages_reminder_id_idx ON public.messages USING btree (reminder_id);

CREATE INDEX messages_provider_message_id_idx ON public.messages USING btree (provider_message_id);

CREATE UNIQUE INDEX opt_outs_pkey ON public.opt_outs USING btree (id);

CREATE UNIQUE INDEX opt_outs_clinic_id_phone_channel_key ON public.opt_outs USING btree (clinic_id, phone, channel);

CREATE INDEX opt_outs_clinic_id_idx ON public.opt_outs USING btree (clinic_id);

CREATE INDEX opt_outs_patient_id_idx ON public.opt_outs USING btree (patient_id);

alter table "public"."reminders" add constraint "reminders_pkey" PRIMARY KEY using index "reminders_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."opt_outs" add constraint "opt_outs_pkey" PRIMARY KEY using index "opt_outs_pkey";

alter table "public"."opt_outs" add constraint "opt_outs_clinic_id_phone_channel_key" UNIQUE using index "opt_outs_clinic_id_phone_channel_key";

alter table "public"."reminders" add constraint "reminders_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'voice'::text]))) not valid;

alter table "public"."reminders" validate constraint "reminders_channel_check";

alter table "public"."reminders" add constraint "reminders_response_status_check" CHECK ((response_status = ANY (ARRAY['confirmed'::text, 'declined'::text, 'opted_out'::text, 'needs_review'::text]))) not valid;

alter table "public"."reminders" validate constraint "reminders_response_status_check";

alter table "public"."reminders" add constraint "reminders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'responded'::text, 'cancelled'::text]))) not valid;

alter table "public"."reminders" validate constraint "reminders_status_check";

alter table "public"."messages" add constraint "messages_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'email'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_channel_check";

alter table "public"."messages" add constraint "messages_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_direction_check";

alter table "public"."messages" add constraint "messages_provider_check" CHECK ((provider = ANY (ARRAY['telnyx'::text, 'manual'::text, 'system'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_provider_check";

alter table "public"."messages" add constraint "messages_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'received'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_status_check";

alter table "public"."opt_outs" add constraint "opt_outs_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'email'::text]))) not valid;

alter table "public"."opt_outs" validate constraint "opt_outs_channel_check";

alter table "public"."reminders" add constraint "reminders_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."reminders" validate constraint "reminders_clinic_id_fkey";

alter table "public"."reminders" add constraint "reminders_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE not valid;

alter table "public"."reminders" validate constraint "reminders_appointment_id_fkey";

alter table "public"."reminders" add constraint "reminders_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) not valid;

alter table "public"."reminders" validate constraint "reminders_patient_id_fkey";

alter table "public"."messages" add constraint "messages_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_clinic_id_fkey";

alter table "public"."messages" add constraint "messages_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) not valid;

alter table "public"."messages" validate constraint "messages_patient_id_fkey";

alter table "public"."messages" add constraint "messages_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) not valid;

alter table "public"."messages" validate constraint "messages_appointment_id_fkey";

alter table "public"."messages" add constraint "messages_reminder_id_fkey" FOREIGN KEY (reminder_id) REFERENCES public.reminders(id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_reminder_id_fkey";

alter table "public"."opt_outs" add constraint "opt_outs_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE not valid;

alter table "public"."opt_outs" validate constraint "opt_outs_clinic_id_fkey";

alter table "public"."opt_outs" add constraint "opt_outs_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) not valid;

alter table "public"."opt_outs" validate constraint "opt_outs_patient_id_fkey";

grant all on table "public"."reminders" to anon;
grant all on table "public"."reminders" to authenticated;
grant all on table "public"."reminders" to service_role;

grant all on table "public"."messages" to anon;
grant all on table "public"."messages" to authenticated;
grant all on table "public"."messages" to service_role;

grant all on table "public"."opt_outs" to anon;
grant all on table "public"."opt_outs" to authenticated;
grant all on table "public"."opt_outs" to service_role;

create policy "Clinic members can view reminders in their clinics"
on "public"."reminders"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));

create policy "Clinic members can view messages in their clinics"
on "public"."messages"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));

create policy "Clinic members can view opt outs in their clinics"
on "public"."opt_outs"
as permissive
for select
to authenticated
using ((clinic_id IN ( SELECT current_clinic_ids.current_clinic_ids
   FROM public.current_clinic_ids() current_clinic_ids(current_clinic_ids))));
