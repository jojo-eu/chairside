# Chairside Read-Only MVP Checkpoint

This checkpoint summarizes the current Chairside MVP state after the read-only application shell phase.

## Current Product Direction

Chairside is a Slovak-first clinic operations dashboard for an AI receptionist product serving Slovak and Czech dental practices. It is a focused dental product, not a generic CRM platform and not a generic AI operating system.

The MVP remains centered on one operational loop:

```text
AI call -> appointment -> dashboard -> reminder -> patient response -> status
```

The current application lets a clinic user inspect the core operational state: patients, services, appointments, calendar, reminders, call history, dashboard KPIs, and recent activity. State-changing workflows are intentionally still deferred.

## Current Architecture Boundaries

- Chairside React UI is the clinic dashboard and admin surface.
- Supabase is the source of truth for clinic business data.
- Supabase Row Level Security scopes tenant data through `public.current_clinic_ids()`.
- Supabase Edge Functions are the future write boundary for booking, reminder, call-log, and integration actions.
- The frontend must not call Vapi, Telnyx, OpenClaw, or OpenClaw-like workflow systems directly.
- `src/components/atomic-crm` remains the inherited application directory and has not been renamed.
- Existing Atomic CRM tables and inherited views remain in place.
- `public.activity_log` remains the inherited Atomic CRM view; Chairside business activity uses `public.chairside_activity_log`.

## Completed Schema Tables

The Chairside schema foundation currently includes:

- `clinics`
- `clinic_members`
- `patients`
- `services`
- `clinic_closures`
- `appointments`
- `chairside_activity_log`
- `reminders`
- `messages`
- `opt_outs`
- `call_logs`

Current schema characteristics:

- Tenant-scoped Chairside tables include `clinic_id`.
- RLS is enabled for Chairside tenant-scoped tables.
- Initial read policies are scoped through `public.current_clinic_ids()`.
- Appointments include a database-level overlap prevention constraint.
- Reminders are appointment-bound.
- Calls are stored in `public.call_logs` for read-only AI receptionist history.
- Provider integration hardening tables such as `provider_events` and `idempotency_keys` are not implemented yet.

## Completed Local Seed Coverage

Local development seed data currently covers:

- One local demo clinic: `Zubná Praxma Bratislava` with slug `zubna-praxma-ba`.
- Clinic config for working hours, SMS template defaults, and reminder defaults.
- Five local test services: Kontrola, Dentálna hygiena, Plomba, Extrakcia, Prevencia.
- Fake Slovak/Czech-style test patients with E.164 phone numbers.
- Test appointments linked to seeded patients and services.
- Clinic closures for future availability testing.
- Chairside activity log examples for dashboard activity feed testing.
- Reminder examples across pending, delivered, responded, and failed states.
- Message examples for outbound reminder SMS and inbound patient replies.
- One opt-out test row.
- Call log examples covering booked, needs-reschedule, missed, failed, answered-question, no-action, and review-needed cases.

All seed data is fake/local development data only and must not be treated as production provisioning.

## Completed Read-Only UI Sections

The current read-only MVP shell includes:

- Dashboard KPIs:
  - Počet pacientov
  - Dnešné termíny
  - Zajtrajšie termíny
  - Nepotvrdené termíny
  - Aktívne služby
- Dashboard activity feed backed by `public.chairside_activity_log`.
- `Pacienti` list backed by `public.patients`.
- `Termíny` list backed by `public.appointments`.
- `Kalendár` read-only grouped appointment view backed by `public.appointments`.
- `Služby` list backed by `public.services`.
- `Pripomienky` list backed by `public.reminders`.
- `Hovory` list backed by `public.call_logs`.

The shell uses Slovak-first labels while keeping code identifiers in English.

## Known Limitations

- The UI is mostly read-only. Create, edit, delete, confirmation, cancellation, and booking actions are not implemented.
- No Edge Functions for `check_availability`, `book_appointment`, reminder sending, SMS webhook handling, or call ingestion exist yet.
- No frontend detail pages or modals for appointments, reminders, calls, transcripts, or patient communication history are implemented yet.
- The active clinic selection model is still minimal; current reads depend on RLS and seeded/local membership.
- Timezone handling uses simple `Europe/Bratislava` formatting in the current UI slices, not a robust per-clinic timezone abstraction.
- Dashboard KPIs use simple read queries and should be revisited after write flows and clinic scoping mature.
- Realtime subscriptions are not implemented yet.
- The local seed may require manual local auth membership setup for browser validation unless a reset/provisioning flow creates it.
- Old Atomic CRM resources still exist internally for compatibility, even though MVP navigation is Chairside-focused.
- Settings remain inherited/minimal and do not yet expose the full Chairside MVP configuration surface.

## Important Technical Decisions

- Keep `src/components/atomic-crm` unchanged as a directory name for now.
- Keep inherited Atomic CRM database tables and views in place.
- Do not modify or replace inherited `public.activity_log`; use `public.chairside_activity_log` for Chairside business events.
- Use Supabase declarative schema files as the source of truth and pair changes with migrations.
- Use RLS on all tenant-scoped Chairside tables.
- Use `clinic_id` on tenant-scoped tables.
- Store timestamps as `timestamptz`; format for clinic users at the UI boundary.
- Store phone numbers in E.164 format.
- Keep frontend integration-free: no Vapi, Telnyx, or OpenClaw calls from React.
- Make write operations go through Edge Functions once implemented.
- Keep changes small and reviewable; avoid broad refactors while Chairside is still stabilizing.

## What Not To Do Next

- Do not add a generic AI OS, workflow builder, prompt manager, agent builder, plugin system, or campaign engine.
- Do not wire the frontend directly to Vapi, Telnyx, OpenClaw, or provider SDKs.
- Do not add booking mutations directly from React to tables.
- Do not bypass RLS or rely on unscoped tenant reads.
- Do not rename `src/components/atomic-crm`.
- Do not rename inherited Atomic CRM tables or views.
- Do not replace `public.activity_log`.
- Do not implement broad settings, billing, public booking pages, calendar sync, team management, or multi-staff scheduling before the core booking loop works.
- Do not run dependency upgrades or `npm audit fix` as part of the next feature phase.
- Do not run `supabase db reset --local` without explicitly warning that it deletes local data and getting approval.

## Recommended Next Phase

Recommended branch:

```text
codex/chairside-booking-functions
```

Recommended next implementation sequence:

1. Implement `check_availability` as a Supabase Edge Function.
2. Implement `book_appointment` as a Supabase Edge Function.
3. Add tests for appointment overlap behavior and RLS boundaries.
4. Add a controlled local booking test flow after the server-side boundary is working.

The next phase should establish the booking write boundary before adding richer UI actions. The database already has appointments, services, clinic hours config, clinic closures, and overlap prevention, so the next useful slice is to safely compute slots and create appointments through Edge Functions.

## Definition Of Done For The Next Phase

The next phase is done when:

- `check_availability` accepts a clinic, service, date/range, and patient-relevant context as needed, then returns available slots derived from working hours, closures, service duration, buffers, and existing appointments.
- `book_appointment` creates an appointment only after validating authorization, clinic scope, patient, service, requested time, and availability.
- Booking relies on the existing database overlap constraint as the final safety net.
- Edge Function inputs and outputs use a stable versioned response shape.
- Tests cover available-slot generation, closed days, service duration/buffer behavior, appointment overlap conflicts, unauthorized access, and cross-clinic isolation.
- Local validation runs without touching production Supabase or real patient data.
- No provider integrations are added unless explicitly requested.
- No direct frontend table mutations are introduced for booking.
- The existing read-only Dashboard, Pacienti, Termíny, Kalendár, Služby, Pripomienky, and Hovory views continue to load after the server-side booking functions are added.
