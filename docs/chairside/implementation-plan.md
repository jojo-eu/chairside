# Chairside Implementation Plan

This plan follows the owner-provided product brief. Chairside is the dashboard/admin layer for an AI receptionist product. The MVP should make this loop reliable:

```text
AI call -> appointment -> dashboard -> reminder -> patient response -> status
```

## Ground Rules

- Do not rename `src/components/atomic-crm`.
- Do not rename existing Atomic CRM database tables as a casual refactor.
- Do not run dependency upgrades or `npm audit fix`.
- Do not refactor unrelated code.
- Do not introduce a generic AI OS, workflow builder, prompt manager, campaign engine, or plugin system.
- Do not make Chairside call Vapi, Telnyx, or OpenClaw directly from React.
- React components contain UI logic only.
- All state-changing business actions go through Supabase Edge Functions.
- Supabase is the source of truth.
- RLS is mandatory on all tenant-scoped tables.
- Every tenant-scoped table includes `clinic_id`.
- Store all `timestamptz` values in UTC.
- Store all phone numbers in E.164 format.
- Keep UI Slovak-first; code identifiers stay English.
- Optimize for one clinic successfully using the system daily.

## Phase 0: Product Documentation Baseline

Goal: Align the repository plan with the Chairside product brief before runtime changes.

Scope:

- Create/update `docs/chairside/product-brief.md`.
- Create/update `docs/chairside/terminology.md`.
- Create/update `docs/chairside/implementation-plan.md`.
- Capture the actual MVP: clinic operations dashboard for AI receptionist, not generic CRM.
- Record architecture boundaries, terminology, IA, data-model implications, risks, and phases.

Review focus:

- Confirm whether implementation should adapt existing Atomic CRM screens first or introduce the new clinic operations resources directly.
- Confirm first branch scope for removing/hiding Deals, Companies, and sales concepts.
- Confirm whether the MVP schema should be implemented alongside or instead of inherited Atomic CRM tables.

## Phase 1: Atomic CRM Surface Cleanup And Slovak Navigation

Suggested branch: `codex/chairside-mvp-navigation`

Goal: Make the visible application stop presenting itself as a generic CRM.

Scope:

- Hide or remove navigation/routes for Deals, Companies, sales pipeline, and sales opportunities.
- Introduce MVP navigation labels: Dashboard, Pacienti, Kalendár, Termíny, Pripomienky, Hovory, Nastavenia.
- Keep `src/components/atomic-crm` path unchanged.
- Keep changes small and UI-only.
- Avoid schema changes in this branch unless unavoidable.

Likely files:

- `src/components/atomic-crm/providers/commons/englishCrmMessages.ts`
- Layout/navigation files under `src/components/atomic-crm/layout/` or root resource registration files.
- Focused route/resource files only as needed.

Verification:

- `make typecheck`
- `make test`, if affected tests exist.
- `make start`
- Browser check of navigation, dashboard, and removed/hidden resources.

## Phase 2: MVP Schema And Seed Baseline

Suggested branch: `codex/chairside-mvp-schema`

Goal: Add the clinic operations database foundation.

Scope:

- Add Supabase migrations in the requested order:
  - `01_extensions.sql`
  - `02_clinics_and_members.sql`
  - `03_helper_functions.sql`
  - `04_healthcare_core.sql`
  - `05_communication.sql`
  - `06_audit.sql`
  - `07_rls_policies.sql`
- Add core tables: `clinics`, `clinic_members`, `patients`, `services`, `clinic_closures`, `appointments`, `reminders`, `messages`, `call_logs`, `opt_outs`, `activity_log`.
- Add hardening tables/helpers where required: `provider_events`, `idempotency_keys`, `set_updated_at()`.
- Add `deleted_at` to patients, appointments, and services.
- Add `version` to patients, appointments, and clinics.
- Add `completed_at` and `no_show_at` to appointments.
- Add appointment exclusion constraint with `btree_gist`.
- Enable RLS and policies for tenant-scoped data.
- Add local-only seed data for one demo clinic, two users, default services, patients, and appointments.

Verification:

- `npx supabase db reset --local`, only after explicit approval because it is destructive.
- `npx supabase migration up --local`
- Inspect tables and RLS in Supabase Studio.
- Verify seed data appears locally only.

Risk controls:

- Do not edit generated migrations casually after schema decisions are made.
- Do not store malformed phone numbers.
- Do not add provider secrets or `.env` files.

## Phase 3: Tenant Handling And Authentication Fit

Suggested branch: `codex/chairside-tenant-auth`

Goal: Support manual provisioning and active clinic scoping.

Scope:

- Disable or bypass self-signup for MVP if current UI exposes it.
- Support Supabase email/password login.
- Add active clinic selection for multi-clinic users.
- Store active `clinic_id` in session and/or URL.
- Scope all UI queries by active clinic.
- Respect roles from `clinic_members`: `owner`, `receptionist`, `dentist`, `super_admin`.
- Keep super-admin management out of UI for MVP.

Verification:

- Login as owner and receptionist seed users.
- Verify clinic switcher if a user has multiple memberships.
- Verify RLS prevents cross-clinic reads and writes.

## Phase 4: Patients And Services UI

Suggested branch: `codex/chairside-patients-services`

Goal: Provide the basic data needed for appointment booking.

Scope:

- Build/replace Patients resource using `patients`.
- List columns: Meno, Telefón, Posledná návšteva, Ďalší termín, Nekontaktovať, Akcie.
- Detail tabs: Info, Termíny, Komunikácia, Hovory.
- Validate and normalize phone numbers to E.164 on UI input and API input.
- Build Services CRUD with duration, buffer, color, active status, and display order.
- Keep clinical records and billing out of scope.

Verification:

- `make typecheck`
- `make test`
- `make start`
- Browser check of patient list/detail and service CRUD.
- Confirm invalid phone numbers are rejected and valid Slovak/Czech numbers normalize correctly.

## Phase 5: Appointments And Read-Only Calendar

Suggested branch: `codex/chairside-appointments-calendar`

Goal: Make appointments visible and manageable without drag-and-drop.

Scope:

- Build Appointments list/detail.
- Build read-only day/week Calendar.
- Show appointment time, patient, service, status color, and source badge.
- Appointment actions: Potvrdiť, Zrušiť, Označiť ako dokončené, Označiť ako nedostavený.
- Actions call Edge Functions rather than direct table mutation.
- Convert UTC timestamps to clinic timezone at UI boundary.

Verification:

- `make typecheck`
- `make test`
- `make start`
- Browser check day/week calendar and appointment detail modal.
- Verify timezone display for `Europe/Bratislava`.

## Phase 6: Scheduling Edge Functions

Suggested branch: `codex/chairside-scheduling-functions`

Goal: Expose stable booking APIs for OpenClaw/Vapi.

Scope:

- Implement versioned Edge Functions:
  - `v1/lookup-patient`
  - `v1/check-availability`
  - `v1/book-appointment`
  - `v1/cancel-appointment`
  - `v1/reschedule-appointment`
- Implement standard error response shape and error codes.
- Implement idempotency for state-changing functions.
- `check-availability` generates slots on the fly from working hours, closures, services, buffers, and existing appointments.
- `book-appointment` revalidates availability and relies on DB exclusion constraint for overlap safety.
- All functions validate `clinic_id` and authorization.
- OpenClaw calls authenticate with `OPENCLAW_EDGE_SECRET`.

Verification:

- Unit tests for slot generation and phone normalization.
- Local Edge Function invocation tests.
- Conflict test for overlapping appointment.
- Idempotency test for repeated booking request.

## Phase 7: Calls UI And Log Function

Suggested branch: `codex/chairside-call-logs`

Goal: Show AI receptionist call outcomes in Chairside.

Scope:

- Implement `v1/log-call`.
- Store call logs with Vapi call ID, caller number, outcome, transcript, recording URL, summary, cost, workflow ID, and review flag.
- Build Calls list and detail.
- Log `call.completed` activity.
- Add provider event archive for webhook/provider debugging where applicable.

Verification:

- Local function invocation with duplicate idempotency key.
- Browser check Calls list/detail.
- Confirm transcript/SMS content is not sent to monitoring logs.

## Phase 8: Reminders And SMS Webhook

Suggested branch: `codex/chairside-reminders`

Goal: Complete the reminder confirmation loop.

Scope:

- Implement `v1/send-reminders` scheduled function.
- Implement `v1/telnyx-sms-webhook`.
- Verify Telnyx signatures on inbound SMS webhooks.
- Create outbound and inbound message rows.
- Parse Slovak/Czech/English YES/NO and opt-out responses.
- Update reminder and appointment statuses.
- Add Reminders list UI.
- Add message timeline where needed.
- Rate limit SMS sends per clinic.

Verification:

- Tests for response parsing with accents and without accents.
- Timezone tests around 24-hour reminder window and DST-sensitive dates.
- Webhook signature verification test.
- Manual local webhook simulation.

## Phase 9: Dashboard, Realtime, Activity Feed

Suggested branch: `codex/chairside-dashboard-realtime`

Goal: Make the receptionist's daily dashboard useful.

Scope:

- Dashboard widgets:
  - Today's appointments.
  - Tomorrow's appointments.
  - Unconfirmed appointments.
  - Reminders sent today.
  - Activity feed, last 20.
  - Latest calls, last 5.
- Enable Supabase Realtime for appointments, call logs, reminders, messages, and activity log.
- Subscribe with `clinic_id` filters.
- Log only business events, not page views or list reads.

Verification:

- Manual realtime update check.
- Browser check all dashboard widgets.
- Confirm RLS still scopes realtime data.

## Phase 10: Settings MVP

Suggested branch: `codex/chairside-settings`

Goal: Expose only the configuration needed for the first clinic.

Scope:

- Clinic info read-only.
- Working hours editor.
- Services CRUD if not already completed.
- AI assistant settings: name, tone, custom instructions.
- SMS template editor.
- Keep billing, team management, notification preferences, and integrations out of MVP.

Verification:

- Browser check settings forms.
- Confirm config changes affect availability and reminders where relevant.

## Phase 11: Reliability, Privacy, And Launch Polish

Suggested branch: `codex/chairside-launch-hardening`

Goal: Prepare the first production clinic trial.

Scope:

- Implement `v1/gdpr-cleanup` cron.
- Add structured Edge Function logging with request/correlation IDs.
- Add monitoring hooks without PII.
- Add basic rate limiting for booking, lookup, and webhook endpoints.
- Document backup and restore process.
- Create manual onboarding playbook.
- End-to-end test with real Vapi call -> appointment -> SMS reminder -> response.

Verification:

- Restore drill documentation.
- PII logging review.
- E2E test notes from real provider run.

## Recommended Next Branch

Recommended next branch:

`codex/chairside-mvp-navigation`

First runtime work should be small and visible: remove/hide generic CRM navigation and introduce Slovak MVP navigation labels, without schema changes in the same branch.

## Current Open Questions

- Should the MVP introduce new resources immediately, or temporarily adapt existing Atomic CRM resources for a faster UI pass?
- What is the exact compatibility strategy for inherited Atomic CRM tables and current local data?
- Should self-signup be removed from UI immediately or hidden only in production mode?
- How will versioned Edge Function URLs be represented in Supabase local development?
- Which phone normalization library or helper should be used for Slovak/Czech E.164 validation?
- Should `Temporal` be polyfilled, or should `date-fns-tz` be added for timezone handling?
- What is the first clinic's real service list and working-hours schedule?
