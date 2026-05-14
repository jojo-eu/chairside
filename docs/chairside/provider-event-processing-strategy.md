# Chairside Provider Event Processing Strategy

This document defines how raw `provider_events` should later be processed into Chairside business state without rushing into production provider integrations.

## Current State

Chairside currently has two raw provider webhook skeletons:

- `telnyx-webhook` stores raw Telnyx-like events in `public.provider_events`.
- `vapi-webhook` stores raw Vapi-like events in `public.provider_events`.

Both skeletons:

- Accept `POST` JSON.
- Store `clinic_id = null` for now.
- Use `provider_events.provider` values of `telnyx` or `vapi`.
- Store the full JSON payload.
- Set `processing_status = "received"`.
- Do not verify provider signatures yet.
- Do not process business logic yet.
- Do not update `messages`, `reminders`, `call_logs`, `appointments`, or activity logs.

`public.provider_events` has `unique(provider, provider_event_id)`, which is the current raw-event deduplication boundary.

## Processing Principles

Provider event processing should follow these rules:

- Store raw events first.
- Verify the provider signature before trusting payload fields.
- Deduplicate raw delivery by `provider` and `provider_event_id`.
- Map the event to a clinic before business processing.
- Process business side effects only after the event is verified and mapped.
- Keep processors idempotent.
- Mark failed processing attempts with `processing_status = "failed"` and `error_message`.
- Mark unsupported or no-op events with `processing_status = "ignored"`.
- Mark successful processing with `processing_status = "processed"` and `processed_at`.
- Do not expose raw service-role processing behavior to frontend code.

Raw capture and business processing are separate concerns. The webhook endpoint should remain a narrow intake boundary; downstream processors should own interpretation and business transitions.

## Proposed Processing Stages

Recommended staged flow:

1. Ingest raw provider event.
2. Verify provider signature or shared secret.
3. Deduplicate by `provider` and `provider_event_id`.
4. Identify provider event type.
5. Map the provider event to a clinic.
6. Map the event to a domain object:
   - `reminders` and `messages` for Telnyx SMS events.
   - `call_logs` for Vapi call events.
7. Apply the business transition.
8. Write `messages`, `call_logs`, or activity rows if needed.
9. Mark the `provider_events` row as `processed`, `ignored`, or `failed`.

Processing should be narrow by event type. A processor should do one small state transition at a time instead of becoming a generic workflow engine.

## Telnyx Event Mapping Strategy

Initial Telnyx processing should focus on SMS lifecycle and inbound response events:

- `message.sent`
- `message.delivered`
- `message.failed`
- `message.received`

For outbound status events:

- Prefer mapping provider status events through `messages.provider_message_id` when available.
- Update message status only after the event is verified, deduplicated, and mapped to a clinic.
- Consider whether reminder state should follow message status:
  - delivered events may later update `reminders.status = "delivered"`.
  - failed events may later update `reminders.status = "failed"`.

For inbound `message.received` events:

- Do not directly update reminders from raw webhook payloads.
- First verify signature.
- Map event to clinic.
- Match to a patient/reminder/message context.
- Store one inbound `messages` row.
- Parse the response only after matching a reminder context.

Response parsing can reuse the `receive-reminder-response` logic conceptually:

- `ÁNO`, `ANO`, `yes`, `y` -> `confirmed`
- `NIE`, `no`, `n` -> `declined`
- other non-empty responses -> `needs_review`

Unsupported Telnyx event types should be marked `ignored` safely, with no downstream side effects.

## Vapi Event Mapping Strategy

Initial Vapi processing should focus on call lifecycle events:

- call started
- call ended
- call failed, if present
- call missed, if present

Mapping rules:

- Provider call id should later map to `call_logs.provider_call_id`.
- Call start events may create or update a `call_logs` row with `status = "started"`.
- Call end events may update the matching call log with `status = "completed"`, timestamps, duration, transcript, summary, and metadata when available.
- Failed or missed events may update or create a call log with `status = "failed"` or `status = "missed"`.

Do not book appointments directly from Vapi raw webhooks. Booking should continue through the existing `check-availability` and `book-appointment` functions, or a controlled internal orchestration path that explicitly validates clinic, patient, service, and appointment context.

Transcript and summary ingestion should be staged separately from basic call lifecycle mapping because payload size, sensitivity, and retention decisions need more care.

Unsupported Vapi event types should be marked `ignored` safely, with no downstream side effects.

## Clinic Mapping Strategy

The current webhook skeletons store `clinic_id = null`. This is deliberate because provider-to-clinic mapping is not implemented yet.

Future mapping options:

- Provider phone number to clinic.
- Configured provider account or subaccount to clinic.
- Vapi assistant id to clinic.
- Vapi or Telnyx phone number to clinic.
- Explicit metadata in provider payload, if controlled by Chairside/OpenClaw.

Rules:

- Do not process unmapped provider events into business state.
- Unmapped events should remain hidden from regular clinic users under current RLS.
- Unmapped events should be visible only to future admin/internal debug tooling.
- Mapping rules must be deterministic enough for retries and support investigations.
- Once mapped, processing may update the `provider_events.clinic_id` field before applying business transitions.

## Idempotency Strategy

Current raw-event idempotency:

- `unique(provider, provider_event_id)` prevents duplicate raw provider event rows.

Business processing still needs its own idempotency strategy because one raw event may produce downstream writes.

Recommended future options:

- Add a `processed_event_actions` table keyed by provider event id and action name.
- Or combine `provider_events.processed_at` with deterministic domain constraints.
- Add domain-specific uniqueness where appropriate, such as one inbound message per provider message id.

Repeated processing should not duplicate:

- `messages`
- `reminders`
- `call_logs`
- `chairside_activity_log` entries
- appointment state transitions

If a processor is retried after failure, it should either safely complete the missing action or return the existing processed result.

## Error Handling

Use the current `processing_status` values consistently:

- `received`: raw event is stored and not yet processed.
- `processed`: event was verified, mapped, and successfully applied.
- `ignored`: event was verified/mapped enough to know no business action is needed.
- `failed`: processing was attempted but could not complete.

Failure handling:

- Store a concise `error_message`.
- Avoid logging provider secrets or sensitive payload fragments.
- Prefer atomic transactions for event status and downstream writes.
- Avoid hidden partial side effects where possible.
- Where transactions are not available in Edge Function code, document the write order, compensation behavior, and retry safety.

If a downstream write succeeds but marking the provider event fails, the retry path must not duplicate the downstream write.

If marking the provider event succeeds but a downstream write fails, the processor should mark the event `failed`, not `processed`.

## Security Requirements Before Production

Before real production provider use:

- Add Telnyx signature verification.
- Add Vapi signature verification or shared-secret verification.
- Keep service-role credentials only inside trusted Edge Functions or server-side processors.
- Never expose service-role credentials or provider secrets to frontend code.
- Add rate limiting or provider-level protection where supported.
- Avoid logging secrets or full sensitive payloads in client-visible UI.
- Treat provider payload fields as untrusted until signature verification and clinic mapping succeed.
- Keep raw unmapped provider events out of regular clinic-user views.

The internal provider events debug UI must remain internal and must not become a public provider event viewer.

## Recommended Implementation Order

Recommended sequence:

1. Add admin/internal visibility for unmapped provider events if local debugging requires it.
2. Implement a Telnyx signature verification skeleton.
3. Implement clinic mapping for Telnyx by provider phone number or controlled provider metadata.
4. Implement a Telnyx message status processor for sent, delivered, and failed events.
5. Implement a Telnyx inbound response processor after reminder/message matching is explicit.
6. Implement a Vapi signature verification or shared-secret skeleton.
7. Implement a Vapi `call_logs` processor.
8. Connect real provider credentials only after signature verification, mapping, idempotency, and failure behavior are clear.

The next implementation step should be intentionally small. A signature-verification skeleton or mapping spike is safer than a processor that changes business state immediately.

## What Not To Do Next

- Do not directly process raw webhooks into bookings.
- Do not book appointments from Vapi raw webhooks.
- Do not update reminders from Telnyx raw webhooks before signature verification and mapping.
- Do not update `messages`, `call_logs`, appointments, or activity logs from unmapped provider events.
- Do not expose `provider_events` to public users.
- Do not expose service-role credentials or provider secrets to frontend code.
- Do not build generic workflow automation UI.
- Do not make provider event processing a campaign engine, workflow builder, or generic AI OS.
