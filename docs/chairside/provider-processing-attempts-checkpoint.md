# Chairside Provider Processing Attempts Checkpoint

This checkpoint summarizes the current `public.provider_event_processing_attempts` schema.

## Purpose

`public.provider_event_processing_attempts` exists to support future idempotent and auditable provider event processing.

It is intended to:

- Provide an audit trail for future provider event processors.
- Support idempotency for future processor side effects.
- Separate raw `provider_events` ingestion from business state transitions.
- Make provider event processing observable without turning it into a generic workflow engine.

This table does not process events by itself. No processor, retry worker, webhook handler, or business transition is implemented as part of this schema slice.

## Current Database State

`public.provider_event_processing_attempts` exists.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `provider_event_id uuid not null`
- `clinic_id uuid`
- `processor text not null`
- `action text not null`
- `status text not null default 'started'`
- `started_at timestamptz not null default now()`
- `finished_at timestamptz`
- `idempotency_key text`
- `result jsonb`
- `error_message text`
- `created_at timestamptz not null default now()`

Foreign keys:

- `provider_event_id` references `public.provider_events(id)` with `on delete cascade`.
- `clinic_id` references `public.clinics(id)` with `on delete set null`.

Allowed `status` values:

- `started`
- `succeeded`
- `failed`
- `ignored`

Indexes:

- `(provider_event_id, started_at desc)`
- `(clinic_id, started_at desc)`
- `(processor, action, started_at desc)`
- `(status, started_at desc)`
- unique `idempotency_key` where `idempotency_key is not null`

## Idempotency Strategy

Raw event deduplication and business side-effect idempotency are separate.

Raw event deduplication:

- `public.provider_events` has `unique(provider, provider_event_id)`.
- This prevents duplicate storage of the same provider-delivered event.

Processing attempt idempotency:

- `public.provider_event_processing_attempts` has a partial unique index on `idempotency_key` where `idempotency_key is not null`.
- `idempotency_key = null` allows non-idempotent/manual audit attempts or exploratory processor runs.
- Non-null keys are reserved for deterministic processor actions that must not run twice.

Future processors should use deterministic idempotency keys, for example:

- `telnyx:<provider_event_id>:message-status`
- `telnyx:<provider_event_id>:inbound-response`
- `vapi:<provider_event_id>:call-log`

The referenced `<provider_event_id>` in these examples should be the canonical `public.provider_events.id` UUID unless a future processor explicitly documents a different stable key.

The goal is that repeated processing never duplicates:

- `messages`
- `reminders`
- `call_logs`
- `chairside_activity_log` rows
- appointment state transitions

## RLS Behavior

RLS is enabled on `public.provider_event_processing_attempts`.

Current SELECT policy:

- Authenticated clinic users can select rows only when `clinic_id in current_clinic_ids()`.

Implications:

- Clinic users can see only processing attempts mapped to their clinic.
- Attempts with `clinic_id = null` are hidden from regular clinic users.
- Unmapped/internal attempts require future admin or internal debug tooling.

This mirrors the current `public.provider_events` RLS behavior for unmapped provider events.

## Current Limitations

- No processor is implemented yet.
- No automatic retries exist yet.
- No transaction helper exists yet.
- No internal UI exists for processing attempts yet.
- No admin-only visibility exists for `clinic_id = null` attempts yet.
- No real Telnyx processing exists yet.
- No real Vapi processing exists yet.
- No attempt rows are created by the current webhook skeletons.
- No business state is mutated from this table.

## Recommended Next Phase

Recommended options:

1. Add an internal/debug read-only view for `provider_event_processing_attempts`.
2. Or add a first processor skeleton that creates processing attempts but does not mutate business state.
3. Then add Telnyx signature verification and clinic mapping strategy.
4. Then add a safe processor for Telnyx message status events.

The next implementation should keep the same boundary: audit/idempotency first, trusted business side effects only after signature verification and mapping are explicit.

## What Not To Do Next

- Do not process raw provider webhooks directly into business state.
- Do not skip idempotency for provider side effects.
- Do not expose attempts or debug data publicly.
- Do not connect real provider credentials before signature and mapping boundaries are explicit.
- Do not update reminders, messages, call logs, appointments, or activity logs from unmapped provider events.
- Do not turn processing attempts into a generic workflow automation UI.
