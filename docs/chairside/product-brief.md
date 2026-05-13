# Chairside Product Brief

## Product Scope

Chairside is a Slovak-first clinic operations dashboard for an AI receptionist product focused on Slovak and Czech dental clinics. It is a fork of Atomic CRM, but it is not a generic CRM and must not become a broad workflow platform.

The MVP exists to make one operational loop work reliably for one dental clinic:

```text
AI phone call -> appointment booking -> dashboard update -> reminder SMS -> patient replies ANO/NIE -> receptionist sees confirmation status
```

Chairside is the dashboard and clinic admin layer. It displays and edits clinic business data, but it does not orchestrate AI workflows, call providers, SMS providers, or external workflow engines directly from the frontend.

In scope for MVP:

- Multi-tenant clinic structure.
- Manual clinic and user provisioning.
- Patients.
- Services.
- Appointments.
- Basic internal scheduling availability.
- AI-created bookings visible in the dashboard and calendar.
- Reminder SMS tracking.
- Patient YES/NO response tracking.
- Call logs from the AI receptionist.
- Activity log.
- Slovak UI.
- Settings for working hours, services, AI assistant basics, and SMS templates.

Out of scope for MVP:

- Cal.com integration.
- Google Calendar or Outlook sync.
- Public booking page.
- Campaign engine, segmentation builder, recall campaigns, waitlist automation, or marketing automation.
- Billing UI.
- Team management UI.
- Multi-staff scheduling, dentist assignment, operatories, or round-robin scheduling.
- Drag-and-drop calendar.
- Self-service onboarding.
- Complex super-admin panel.
- WhatsApp support.
- Email campaigns.
- Medical records or EHR.
- Patient billing, patient portal, mobile app.
- Generic AI OS, workflow builder, prompt manager, agent builder, plugin system, or generic CRM abstraction.

## System Boundaries

| Component | Role |
| --- | --- |
| Chairside / Atomic fork | UI, dashboard, CRUD, clinic admin |
| Supabase | Source of truth for business data |
| Supabase Edge Functions | Stable API and write boundary between clients, integrations, and DB |
| OpenClaw / ClawBuddy | Workflow orchestration and AI voice logic |
| Vapi / Telnyx | External voice and SMS providers |

Hard rules:

- Chairside frontend must not call Vapi, Telnyx, or OpenClaw directly.
- Chairside must not import OpenClaw code or share runtime state with OpenClaw.
- Supabase is canonical for clinics, patients, appointments, reminders, messages, call logs, and activity logs.
- React components contain UI logic only.
- All state-changing business actions go through Edge Functions.
- UI reads directly from Supabase and subscribes via Realtime, scoped by active `clinic_id`.
- Edge Functions using service-role privileges must explicitly validate caller authorization and `clinic_id`.

## Target Users

Primary MVP users:

- Receptionists who need to see appointments, confirmations, cancellations, reminders, call outcomes, and items needing human review.
- Clinic owners or administrators who manage working hours, services, SMS templates, and AI assistant settings.
- Dentists who may need read-only visibility into patient appointments and call context.
- Founder/super-admin, using direct database access for MVP provisioning and support.

External actors:

- Patients calling the AI receptionist and replying to SMS reminders.
- OpenClaw/Vapi creating bookings through Edge Functions.
- Telnyx delivering SMS webhook events to Edge Functions.

## Main User Workflows

### AI Appointment Booking

1. Patient calls the clinic phone number.
2. Vapi sends tool calls to OpenClaw.
3. OpenClaw calls Chairside Edge Functions.
4. `lookup-patient` finds an existing patient by E.164 phone, or the flow creates one if supported.
5. `check-availability` computes slots from clinic working hours, closures, service duration, buffer, and existing appointments.
6. Patient chooses a slot.
7. `book-appointment` creates the appointment in Supabase.
8. Chairside dashboard and calendar update via Supabase Realtime.
9. `log-call` stores transcript metadata, summary, outcome, and review status.

### Reminder Confirmation

1. `send-reminders` cron finds appointments around 24 hours away.
2. It creates a reminder and outbound message.
3. Telnyx sends the SMS using the clinic template.
4. Patient replies `ANO` / `ÁNO` / `NIE` or equivalent.
5. `telnyx-sms-webhook` verifies the signature, normalizes the phone, creates an inbound message, parses the response, and updates reminder and appointment status.
6. Receptionist sees confirmation, cancellation, opt-out, or review-needed status in Chairside.

### Reception Daily Operations

1. Open dashboard.
2. Review today's appointments, tomorrow's appointments, unconfirmed appointments, reminders sent today, latest calls, and activity feed.
3. Open calendar day/week view for read-only schedule visibility.
4. Inspect appointment detail, patient detail, reminders, calls, and communication history.
5. Confirm, cancel, mark completed, or mark no-show through Edge Function-backed actions.

### Clinic Setup And Administration

1. Founder manually creates clinic and user records.
2. Clinic owner logs in with Supabase Auth email/password.
3. If the user belongs to multiple clinics, they choose active clinic.
4. Settings expose MVP-safe configuration: read-only clinic info, working hours, services CRUD, AI assistant basics, and SMS templates.
5. Billing, team management, notification preferences, and integrations stay out of MVP.

## Information Architecture

MVP navigation:

- Dashboard
- Pacienti
- Kalendár
- Termíny
- Pripomienky
- Hovory
- Nastavenia

Hide or remove from MVP navigation:

- Deals.
- Companies.
- Sales pipeline.
- Sales opportunities.
- Generic CRM positioning.

Dashboard widgets:

- Today's appointments count and list.
- Tomorrow's appointments count and list.
- Unconfirmed appointments count.
- Reminders sent today count.
- Activity feed, last 20 entries.
- Latest calls, last 5.

Patients:

- List columns: Meno, Telefón, Posledná návšteva, Ďalší termín, Nekontaktovať, Akcie.
- Detail tabs: Info, Termíny, Komunikácia, Hovory.

Calendar:

- Read-only day/week view for MVP.
- No drag-and-drop.
- Show time, patient name, service, status color, and source badge.
- Click opens appointment detail modal.

Appointments:

- Detail shows patient, service, starts/ends, status, source, notes, and filtered activity log.
- Actions: Potvrdiť, Zrušiť, Označiť ako dokončené, Označiť ako nedostavený.

Reminders:

- List columns: Pacient, Termín, Naplánované na, Odoslané o, Stav, Odpoveď, Výsledok.

Calls:

- List columns: Čas, Pacient / neznámy, Trvanie, Výsledok, Termín, Súhrn, Označené na review.
- Detail view: transcript, summary, recording URL, workflow ID, outcome.

Settings:

- Klinika info, read-only in MVP.
- Pracovné hodiny.
- Služby.
- AI asistent.
- SMS šablóny.

## UI Language

Primary UI language for MVP is Slovak. Code identifiers remain in English and UI strings should go through i18n.

Reference navigation labels:

- Dashboard: `Dashboard`
- Patients: `Pacienti`
- Calendar: `Kalendár`
- Appointments: `Termíny`
- Reminders: `Pripomienky`
- Calls: `Hovory`
- Settings: `Nastavenia`

Czech translations come after MVP as a separate localization pass.

## Data Model Implications

The Chairside MVP requires new clinic operations tables rather than a simple relabeling of Atomic CRM's current sales resources.

Required MVP entities:

- `clinics`
- `clinic_members`
- `patients`
- `services`
- `clinic_closures`
- `appointments`
- `reminders`
- `messages`
- `call_logs`
- `opt_outs`
- `activity_log`
- `provider_events`
- `idempotency_keys`, for state-changing Edge Functions

Permanent modeling rules:

- Every tenant-scoped table has `clinic_id`.
- RLS is enabled on tenant-scoped tables.
- UI queries are scoped to active clinic.
- Supabase stores all `timestamptz` values in UTC.
- Each clinic has `clinics.timezone`, default `Europe/Bratislava`.
- Phone numbers are stored in E.164 format only.
- Appointments use a database exclusion constraint to prevent overlaps.
- Generated slots are never persisted.
- Reminders are appointment-bound, not a general campaign system.
- Patients, appointments, and services should use soft delete via `deleted_at`.
- Tables with `updated_at` use a shared trigger.
- Patients, appointments, and clinics should include optimistic locking via `version`.

## Edge Function Implications

Required MVP Edge Functions:

- `v1/lookup-patient`
- `v1/check-availability`
- `v1/book-appointment`
- `v1/cancel-appointment`
- `v1/reschedule-appointment`
- `v1/log-call`
- `v1/send-reminders`
- `v1/telnyx-sms-webhook`
- `v1/gdpr-cleanup`

State-changing functions accept `idempotency_key` where appropriate. All functions return a standard error shape with stable error codes.

Edge Function authentication sources:

- Chairside UI: Supabase JWT.
- OpenClaw/Vapi path: shared `OPENCLAW_EDGE_SECRET`.
- Telnyx webhook: `Telnyx-Signature-Ed25519` verification.
- Cron: service role with public reachability controlled.

## Risks And Open Questions

Risks:

- Reusing Atomic CRM resources too literally could preserve sales concepts that the MVP explicitly rejects.
- Direct frontend provider calls would break security and architecture boundaries.
- Timezone handling can create booking and reminder bugs, especially across DST.
- Malformed phone storage would break patient lookup and SMS response matching.
- Missing idempotency could create duplicate bookings or duplicate call logs.
- Weak RLS or unverified service-role Edge Functions could leak tenant data.
- Logging PII, transcripts, or SMS content to monitoring tools would create privacy risk.
- Building campaigns, public booking, billing, or team management too early would distract from the core loop.

Open questions:

- Should the first implementation adapt existing Atomic CRM resources temporarily, or introduce the new clinic operations resources directly?
- What is the exact migration strategy from current Atomic CRM tables to the MVP schema?
- Does MVP include manual patient creation in the UI before AI booking, or only seed/import data?
- How should unknown callers be represented when no patient match exists?
- Which appointment actions must be available from UI on day one versus only through Edge Functions?
- What monitoring stack is confirmed for MVP: Sentry, BetterStack, both, or neither?
- Where should versioned Edge Function paths be represented in Supabase function naming and routing?
- What is the expected first clinic's working-hours pattern and service list?
