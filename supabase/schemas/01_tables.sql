--
-- Tables
-- This file declares all tables in the public schema.
--

-- Extensions
create extension if not exists "http" with schema "extensions";
create extension if not exists "citext" with schema "extensions";
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "btree_gist" with schema "extensions";

-- Private schema (used by sales policies migration)
create schema if not exists "private";

create table public.clinics (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    phone text,
    email text,
    address jsonb,
    timezone text not null default 'Europe/Bratislava',
    language text not null default 'sk',
    subscription_tier text not null default 'tier1',
    subscription_status text not null default 'trial',
    config jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table public.clinic_members (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    clinic_id uuid not null,
    role text not null check (role in ('owner', 'receptionist', 'dentist', 'super_admin')),
    full_name text,
    created_at timestamp with time zone not null default now(),
    unique (user_id, clinic_id)
);

create table public.patients (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    first_name text not null,
    last_name text not null,
    phone text not null,
    email text,
    date_of_birth date,
    language text not null default 'sk',
    notes text,
    tags jsonb not null default '[]'::jsonb,
    last_visit_at timestamp with time zone,
    do_not_contact boolean not null default false,
    do_not_contact_reason text,
    consent_given_at timestamp with time zone,
    consent_source text,
    data_retention_until timestamp with time zone,
    source text not null default 'manual',
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    created_by uuid
);

create table public.services (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    name text not null,
    duration_minutes integer not null,
    buffer_minutes integer not null default 0,
    color text not null default '#3B82F6',
    description text,
    active boolean not null default true,
    display_order integer not null default 0,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table public.clinic_closures (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    date date not null,
    reason text,
    created_at timestamp with time zone not null default now(),
    unique (clinic_id, date)
);

create table public.appointments (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    patient_id uuid not null,
    service_id uuid not null,
    starts_at timestamp with time zone not null,
    ends_at timestamp with time zone not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'reminder_sent', 'confirmed', 'cancelled', 'needs_reschedule', 'completed', 'no_show')),
    source text not null default 'manual' check (source in ('manual', 'ai_voice', 'ai_sms', 'imported')),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    created_by uuid,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    notes text,
    patient_notes text
);

create table public.chairside_activity_log (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    actor_type text not null check (actor_type in ('user', 'ai', 'system', 'patient')),
    actor_id uuid,
    actor_label text,
    action text not null,
    entity_type text,
    entity_id uuid,
    details jsonb,
    created_at timestamp with time zone not null default now()
);

create table public.reminders (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    appointment_id uuid not null,
    patient_id uuid not null,
    scheduled_for timestamp with time zone not null,
    sent_at timestamp with time zone,
    status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'responded', 'cancelled')),
    channel text not null default 'sms' check (channel in ('sms', 'voice')),
    template_key text not null,
    response_status text check (response_status in ('confirmed', 'declined', 'opted_out', 'needs_review')),
    response_received_at timestamp with time zone,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table public.messages (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    patient_id uuid,
    appointment_id uuid,
    reminder_id uuid,
    direction text not null check (direction in ('inbound', 'outbound')),
    channel text not null default 'sms' check (channel in ('sms', 'whatsapp', 'email')),
    provider text check (provider in ('telnyx', 'manual', 'system')),
    provider_message_id text,
    body text not null,
    status text not null default 'pending' check (status in ('pending', 'queued', 'sent', 'delivered', 'failed', 'received')),
    sent_at timestamp with time zone,
    received_at timestamp with time zone,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone not null default now()
);

create table public.opt_outs (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    patient_id uuid,
    phone text not null,
    channel text not null default 'sms' check (channel in ('sms', 'whatsapp', 'email')),
    reason text,
    created_at timestamp with time zone not null default now(),
    unique (clinic_id, phone, channel)
);

create table public.call_logs (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    patient_id uuid,
    appointment_id uuid,
    direction text not null check (direction in ('inbound', 'outbound')),
    phone text not null,
    provider text not null check (provider in ('vapi', 'telnyx', 'manual', 'system')),
    provider_call_id text,
    status text not null check (status in ('started', 'completed', 'failed', 'missed')),
    outcome text not null default 'unknown' check (outcome in ('booked', 'needs_reschedule', 'cancelled', 'answered_question', 'no_action', 'failed', 'unknown')),
    started_at timestamp with time zone not null,
    ended_at timestamp with time zone,
    duration_seconds integer,
    transcript text,
    summary text,
    metadata jsonb not null default '{}'::jsonb,
    needs_review boolean not null default false,
    created_at timestamp with time zone not null default now()
);

create table public.provider_events (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid,
    provider text not null check (provider in ('telnyx', 'vapi', 'system', 'manual')),
    provider_event_id text not null,
    event_type text not null,
    resource_type text,
    resource_id text,
    received_at timestamp with time zone not null default now(),
    processed_at timestamp with time zone,
    processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
    payload jsonb not null,
    error_message text,
    created_at timestamp with time zone not null default now(),
    unique (provider, provider_event_id)
);

create table public.provider_event_processing_attempts (
    id uuid primary key default gen_random_uuid(),
    provider_event_id uuid not null,
    clinic_id uuid,
    processor text not null,
    action text not null,
    status text not null default 'started' check (status in ('started', 'succeeded', 'failed', 'ignored')),
    started_at timestamp with time zone not null default now(),
    finished_at timestamp with time zone,
    idempotency_key text,
    result jsonb,
    error_message text,
    created_at timestamp with time zone not null default now()
);

create table public.provider_mappings (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null,
    provider text not null check (provider in ('telnyx', 'vapi', 'system', 'manual')),
    mapping_type text not null check (mapping_type in ('phone_number', 'assistant_id', 'account_id', 'messaging_profile_id', 'webhook_secret_id', 'other')),
    provider_identifier text not null,
    label text,
    active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint provider_mappings_provider_mapping_type_identifier_key unique (provider, mapping_type, provider_identifier)
);

create table public.companies (
    id bigint generated by default as identity primary key,
    created_at timestamp with time zone not null default now(),
    name text not null,
    sector text,
    size smallint,
    linkedin_url text,
    website extensions.citext,
    phone_number text,
    address text,
    zipcode text,
    city text,
    state_abbr text,
    sales_id bigint,
    context_links json,
    country text,
    description text,
    revenue text,
    tax_identifier text,
    logo jsonb
);

create table public.contacts (
    id bigint generated by default as identity primary key,
    first_name text,
    last_name text,
    gender text,
    title text,
    background text,
    avatar jsonb,
    first_seen timestamp with time zone,
    last_seen timestamp with time zone,
    has_newsletter boolean,
    status text,
    tags bigint[],
    company_id bigint,
    sales_id bigint,
    linkedin_url text,
    email_jsonb jsonb,
    phone_jsonb jsonb
);

create table public.contact_notes (
    id bigint generated by default as identity (sequence name public."contactNotes_id_seq") not null,
    contact_id bigint not null,
    text text,
    date timestamp with time zone default now(),
    sales_id bigint,
    status text,
    attachments jsonb[]
);

create table public.deals (
    id bigint generated by default as identity primary key,
    name text not null,
    company_id bigint,
    contact_ids bigint[],
    category text,
    stage text not null,
    description text,
    amount bigint,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    archived_at timestamp with time zone,
    expected_closing_date date,
    sales_id bigint,
    index smallint
);

create table public.deal_notes (
    id bigint generated by default as identity (sequence name public."dealNotes_id_seq") not null,
    deal_id bigint not null,
    type text,
    text text,
    date timestamp with time zone default now(),
    sales_id bigint,
    attachments jsonb[]
);

create table public.sales (
    id bigint generated by default as identity primary key,
    first_name text not null default 'Pending'::text,
    last_name text not null default 'Pending'::text,
    email extensions.citext not null,
    administrator boolean not null,
    user_id uuid not null,
    avatar jsonb,
    disabled boolean not null default false
);

create unique index uq__sales__user_id on public.sales using btree (user_id);

create table public.tags (
    id bigint generated by default as identity primary key,
    name text not null,
    color text not null
);

create table public.tasks (
    id bigint generated by default as identity primary key,
    contact_id bigint not null,
    type text,
    text text,
    due_date timestamp with time zone,
    done_date timestamp with time zone,
    sales_id bigint
);

create table public.configuration (
    id integer not null default 1 primary key,
    config jsonb not null default '{}'::jsonb,
    constraint configuration_singleton check (id = 1)
);

create table public.favicons_excluded_domains (
    id bigint generated by default as identity primary key,
    domain text not null
);

--
-- Foreign keys
--

alter table public.clinic_members
    add constraint clinic_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.clinic_members
    add constraint clinic_members_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.patients
    add constraint patients_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.patients
    add constraint patients_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.services
    add constraint services_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.clinic_closures
    add constraint clinic_closures_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.appointments
    add constraint appointments_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.appointments
    add constraint appointments_patient_id_fkey foreign key (patient_id) references public.patients(id) on delete cascade;

alter table public.appointments
    add constraint appointments_service_id_fkey foreign key (service_id) references public.services(id);

alter table public.appointments
    add constraint appointments_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.appointments
    add constraint appointments_no_overlap exclude using gist (
        clinic_id with =,
        tstzrange(starts_at, ends_at) with &&
    ) where (status not in ('cancelled', 'no_show'));

alter table public.chairside_activity_log
    add constraint chairside_activity_log_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.reminders
    add constraint reminders_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.reminders
    add constraint reminders_appointment_id_fkey foreign key (appointment_id) references public.appointments(id) on delete cascade;

alter table public.reminders
    add constraint reminders_patient_id_fkey foreign key (patient_id) references public.patients(id);

alter table public.messages
    add constraint messages_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.messages
    add constraint messages_patient_id_fkey foreign key (patient_id) references public.patients(id);

alter table public.messages
    add constraint messages_appointment_id_fkey foreign key (appointment_id) references public.appointments(id);

alter table public.messages
    add constraint messages_reminder_id_fkey foreign key (reminder_id) references public.reminders(id) on delete set null;

alter table public.opt_outs
    add constraint opt_outs_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.opt_outs
    add constraint opt_outs_patient_id_fkey foreign key (patient_id) references public.patients(id);

alter table public.call_logs
    add constraint call_logs_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.call_logs
    add constraint call_logs_patient_id_fkey foreign key (patient_id) references public.patients(id);

alter table public.call_logs
    add constraint call_logs_appointment_id_fkey foreign key (appointment_id) references public.appointments(id);

alter table public.provider_events
    add constraint provider_events_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete set null;

alter table public.provider_event_processing_attempts
    add constraint provider_event_processing_attempts_provider_event_id_fkey foreign key (provider_event_id) references public.provider_events(id) on delete cascade;

alter table public.provider_event_processing_attempts
    add constraint provider_event_processing_attempts_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete set null;

alter table public.provider_mappings
    add constraint provider_mappings_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;

alter table public.companies
    add constraint companies_sales_id_fkey foreign key (sales_id) references public.sales(id);

alter table public.contacts
    add constraint contacts_company_id_fkey foreign key (company_id) references public.companies(id) on update cascade on delete cascade;

alter table public.contacts
    add constraint contacts_sales_id_fkey foreign key (sales_id) references public.sales(id);

alter table public.contact_notes
    add constraint "contactNotes_contact_id_fkey" foreign key (contact_id) references public.contacts(id) on update cascade on delete cascade;

alter table public.contact_notes
    add constraint "contactNotes_sales_id_fkey" foreign key (sales_id) references public.sales(id) on update cascade on delete cascade;

alter table public.deals
    add constraint deals_company_id_fkey foreign key (company_id) references public.companies(id) on update cascade on delete cascade;

alter table public.deals
    add constraint deals_sales_id_fkey foreign key (sales_id) references public.sales(id);

alter table public.deal_notes
    add constraint "dealNotes_deal_id_fkey" foreign key (deal_id) references public.deals(id) on update cascade on delete cascade;

alter table public.deal_notes
    add constraint "dealNotes_sales_id_fkey" foreign key (sales_id) references public.sales(id);

alter table public.sales
    add constraint sales_user_id_fkey foreign key (user_id) references auth.users(id);

alter table public.tasks
    add constraint tasks_contact_id_fkey foreign key (contact_id) references public.contacts(id) on update cascade on delete cascade;

-- Legacy primary key constraint names (from before snake_case rename)
alter table only public.contact_notes
    add constraint "contactNotes_pkey" primary key (id);

alter table only public.deal_notes
    add constraint "dealNotes_pkey" primary key (id);

--
-- Indexes on foreign keys
--

create index clinic_members_user_id_idx on public.clinic_members using btree (user_id);
create index clinic_members_clinic_id_idx on public.clinic_members using btree (clinic_id);
create index patients_clinic_id_idx on public.patients using btree (clinic_id);
create unique index patients_clinic_phone_idx on public.patients using btree (clinic_id, phone);
create index patients_clinic_last_visit_at_idx on public.patients using btree (clinic_id, last_visit_at);
create index services_clinic_id_idx on public.services using btree (clinic_id);
create index clinic_closures_clinic_id_idx on public.clinic_closures using btree (clinic_id);
create index appointments_clinic_starts_at_idx on public.appointments using btree (clinic_id, starts_at);
create index appointments_patient_id_idx on public.appointments using btree (patient_id);
create index appointments_clinic_status_starts_at_idx on public.appointments using btree (clinic_id, status, starts_at);
create index chairside_activity_log_clinic_created_at_idx on public.chairside_activity_log using btree (clinic_id, created_at desc);
create index chairside_activity_log_entity_idx on public.chairside_activity_log using btree (entity_type, entity_id);
create index reminders_clinic_id_idx on public.reminders using btree (clinic_id);
create index reminders_appointment_id_idx on public.reminders using btree (appointment_id);
create index reminders_clinic_scheduled_for_idx on public.reminders using btree (clinic_id, scheduled_for);
create index reminders_clinic_status_idx on public.reminders using btree (clinic_id, status);
create index messages_clinic_id_idx on public.messages using btree (clinic_id);
create index messages_patient_id_idx on public.messages using btree (patient_id);
create index messages_appointment_id_idx on public.messages using btree (appointment_id);
create index messages_reminder_id_idx on public.messages using btree (reminder_id);
create index messages_provider_message_id_idx on public.messages using btree (provider_message_id);
create index opt_outs_clinic_id_idx on public.opt_outs using btree (clinic_id);
create index opt_outs_patient_id_idx on public.opt_outs using btree (patient_id);
create index call_logs_clinic_started_at_idx on public.call_logs using btree (clinic_id, started_at desc);
create index call_logs_patient_id_idx on public.call_logs using btree (patient_id);
create index call_logs_appointment_id_idx on public.call_logs using btree (appointment_id);
create index call_logs_provider_call_id_idx on public.call_logs using btree (provider_call_id);
create index call_logs_clinic_needs_review_idx on public.call_logs using btree (clinic_id, needs_review);
create index provider_events_clinic_received_at_idx on public.provider_events using btree (clinic_id, received_at desc);
create index provider_events_processing_status_received_at_idx on public.provider_events using btree (processing_status, received_at);
create index provider_events_event_type_idx on public.provider_events using btree (event_type);
create index provider_event_attempts_provider_event_started_at_idx on public.provider_event_processing_attempts using btree (provider_event_id, started_at desc);
create index provider_event_attempts_clinic_started_at_idx on public.provider_event_processing_attempts using btree (clinic_id, started_at desc);
create index provider_event_attempts_processor_action_started_at_idx on public.provider_event_processing_attempts using btree (processor, action, started_at desc);
create index provider_event_attempts_status_started_at_idx on public.provider_event_processing_attempts using btree (status, started_at desc);
create unique index provider_event_attempts_idempotency_key_idx on public.provider_event_processing_attempts using btree (idempotency_key) where (idempotency_key is not null);
create index provider_mappings_clinic_id_idx on public.provider_mappings using btree (clinic_id);
create index provider_mappings_clinic_provider_active_idx on public.provider_mappings using btree (clinic_id, provider, active);
create index contact_notes_contact_id_idx on public.contact_notes using btree (contact_id);
create index contacts_company_id_idx on public.contacts using btree (company_id);
create index deal_notes_deal_id_idx on public.deal_notes using btree (deal_id);
create index deals_company_id_idx on public.deals using btree (company_id);
