# Chairside Telnyx Inbound Response Processing Design

This design defines safe matching and processing rules for a future Telnyx `message.received` reminder response processor.

## Purpose

The future inbound processor should process Telnyx inbound `message.received` events into Chairside reminder responses.

The goal is to:

- Reuse the existing `receive-reminder-response` behavior conceptually.
- Store inbound patient responses as `public.messages` rows.
- Update exactly one safely matched `public.reminders` row.
- Avoid unsafe matching or broad reminder mutation.
- Keep appointment booking, rescheduling, and outbound replies out of scope.

This document is design-only. It does not implement inbound response processing.

## Current State

Current related behavior:

- The Telnyx message status processor handles outbound `message.sent`, `message.delivered`, and `message.failed` events.
- Telnyx `message.received` is intentionally not processed yet.
- `receive-reminder-response` can manually record an inbound response for a known `reminder_id`.
- `public.provider_events` stores raw provider events and deduplicates raw delivery with `unique(provider, provider_event_id)`.
- `public.provider_event_processing_attempts` provides processing audit and idempotency.
- `public.provider_mappings` can map raw provider events to `clinic_id`.

The existing manual `receive-reminder-response` function already:

- Requires a known `clinic_id` and `reminder_id`.
- Creates one inbound `public.messages` row.
- Parses the response as `confirmed`, `declined`, or `needs_review`.
- Updates the reminder to `status = "responded"`.

The future Telnyx processor should preserve that safety model while replacing the manually supplied `reminder_id` with explicit matching rules.

## Required Preconditions Before Processing

Before a Telnyx inbound response processor mutates business state:

- The `provider_events` row must be mapped to `clinic_id`.
- `provider_events.provider` must be `telnyx`.
- `provider_events.event_type` must be `message.received`.
- The Telnyx signature/auth boundary must be respected at webhook ingestion.
- The inbound payload must expose enough identifiers to match safely.
- Processing must be idempotent.
- The processor must create its `provider_event_processing_attempts` row only after clinic mapping is known.

If any required precondition is missing, the processor should not update reminders.

## Proposed Matching Strategy

The processor should extract these fields from the Telnyx-like raw payload:

- Inbound provider message id from `payload.data.payload.id` or a similar Telnyx message id field.
- Response body from `payload.data.payload.text` or `payload.data.payload.body`.
- Patient phone number from the inbound message `from` number.
- Clinic or Telnyx phone number from the inbound message `to` number.

Clinic matching:

- If `provider_events.clinic_id` is already set, use it.
- If `provider_events.clinic_id` is `null`, map the event through `provider_mappings` using the inbound clinic/Telnyx phone number.
- Do not process the event if clinic mapping is missing.

Reminder matching should use the safest available path:

1. If the payload references a prior outbound provider message id, match that id to an existing outbound `messages` row.
2. If an outbound message is matched, use its `reminder_id`, `appointment_id`, and `patient_id`.
3. If no direct outbound reference exists, consider a fallback only when patient phone data and message history are reliable:
   - same `clinic_id`
   - same patient phone
   - latest sent or delivered outbound reminder message
   - recent safe time window
   - exactly one candidate reminder
4. If no safe match exists, do not update a reminder.
5. If multiple candidate reminders match, do not update any reminder.

The processor must never infer a reminder from response text alone.

## Response Parsing

The future processor should reuse the existing `receive-reminder-response` parsing concept and later extract it into a shared helper if needed.

Normalization:

- Trim leading and trailing whitespace.
- Lowercase the text.
- Remove diacritics.
- Compare the normalized value to known tokens.

Confirmed responses:

- `ÁNO`
- `ANO`
- `YES`
- `Y`

Declined responses:

- `NIE`
- `NO`
- `N`

Any other non-empty response should become `needs_review`.

Empty or missing body should not update a reminder. The event should be ignored or routed to manual review according to the failure rules below.

## Proposed Business Writes

For a safely matched inbound reminder response, the processor should write:

1. One inbound `public.messages` row:
   - `clinic_id`
   - `patient_id`, if safely matched
   - `appointment_id`, if safely matched
   - `reminder_id`, if safely matched
   - `direction = "inbound"`
   - `channel = "sms"`
   - `provider = "telnyx"`
   - `provider_message_id = inbound Telnyx message id`
   - `body`
   - `status = "received"`
   - `received_at = now()`
   - `metadata.parsed_response`
   - `metadata.provider_event_id`
   - `metadata.template_key`, if available from the matched reminder
2. The matched `public.reminders` row:
   - `status = "responded"`
   - `response_status = confirmed | declined | needs_review`
   - `response_received_at = now()`
3. The `public.provider_events` row:
   - `processing_status = "processed"`
   - `processed_at = now()`
   - `error_message = null`
4. The `public.provider_event_processing_attempts` row:
   - `status = "succeeded"`
   - `finished_at = now()`
   - `result` summary with matched reminder, message, and parsed response ids/statuses

### No Safe Match Recommendation

If there is no safe reminder match, the recommended behavior is:

- Do not create an inbound `messages` row.
- Do not update a reminder.
- Mark the processing attempt `ignored`.
- Mark the provider event `ignored`.
- Store a result reason such as `no_safe_reminder_match` or `ambiguous_reminder_match`.

Tradeoff: this avoids creating orphan inbound message rows with uncertain patient or reminder context. The cost is that raw inbound text remains only in `provider_events.payload` until an admin/manual review path exists. This is preferable before production signature verification, phone normalization, and manual review tooling are complete.

Later, Chairside can add a controlled admin review flow that creates an inbound message without `reminder_id` only when the reviewer explicitly chooses the clinic, patient, and handling outcome.

## Idempotency

Raw event idempotency:

- `provider_events` uses `unique(provider, provider_event_id)` to dedupe raw provider delivery.

Processing idempotency:

- `provider_event_processing_attempts.idempotency_key` should prevent duplicate processing for the same provider event and action.
- The existing key format can remain:

```text
provider + ":" + provider_events.id + ":" + action
```

Inbound message idempotency:

- The processor should check for an existing inbound `messages` row with the same `provider`, `provider_message_id`, and `direction = "inbound"` before inserting.
- A future unique constraint on `messages(provider, provider_message_id, direction)` should be considered before production if provider ids are reliably present.
- If the inbound message already exists, the processor should return the existing result or mark the attempt duplicate without creating a second message.

Reminder idempotency:

- A retry must not update multiple reminders.
- Reprocessing the same provider event should not create duplicate inbound messages or duplicate reminder response transitions.
- If the reminder is already `responded` from the same provider message, the processor should treat the operation as already complete.

## Safety Rules

The inbound response processor should follow these rules:

- Do not infer patient or reminder from text alone.
- Do not update multiple reminders.
- Do not process if clinic mapping is missing.
- Do not process if patient or reminder matching is ambiguous.
- Do not book appointments from SMS text in this slice.
- Do not reschedule appointments from SMS text in this slice.
- Do not cancel appointments from SMS text in this slice.
- Do not send outbound SMS replies in this slice.
- Do not expose raw provider payloads in public UI.
- Do not store provider secrets in the database.

## Failure And Ignored Behavior

Suggested outcomes:

- Missing provider message id: mark attempt/event `ignored` with `provider_message_id_not_found`.
- Missing or empty body: mark attempt/event `ignored` with `empty_inbound_body`.
- No clinic mapping: return or mark `provider_mapping_not_found`; do not mutate business tables.
- No safe reminder match: mark attempt/event `ignored` with `no_safe_reminder_match`.
- Ambiguous reminder match: mark attempt/event `ignored` with `ambiguous_reminder_match`.
- Unsupported provider/event type: use classify-only ignored behavior.
- Database failure: mark attempt `failed` and provider event `failed` with a concise `error_message`.

Unknown inbound text should not produce a hard failure if the event was stored and a reminder was safely matched. It should parse as `needs_review`, create the inbound message, and update the reminder response status to `needs_review`.

## Recommended Implementation Order

Recommended sequence:

1. Extract the response parser into a shared helper or keep a small local function with tests for the first slice.
2. Implement an inbound processor only for direct known reminder matches through a referenced outbound provider message id.
3. Add idempotency checks for inbound `messages.provider_message_id`.
4. Add tests for `confirmed`, `declined`, and `needs_review`.
5. Add safe fallback matching only after patient phone data and message history are reliable.
6. Consider a unique constraint for inbound provider message ids before production.
7. Add manual/admin review tooling for ignored inbound responses if needed.

The first implementation should prefer fewer matches over risky matches.

## What Not To Do Next

- Do not parse appointment booking requests from inbound SMS yet.
- Do not update reminders from ambiguous matches.
- Do not send outbound SMS replies.
- Do not connect real Telnyx production without real signature verification.
- Do not expose raw provider payloads publicly.
- Do not create broad workflow automation around inbound SMS.
- Do not use inbound SMS text as an appointment command language in this slice.
