# Chairside Telnyx Inbound Reminder Response Processor Checkpoint

This checkpoint summarizes the current Telnyx inbound reminder response processor in the `process-provider-event` Edge Function.

## Purpose

This is the first narrow inbound patient response processor for Chairside provider events.

It exists to:

- Process Telnyx `message.received` events into existing reminder response state.
- Create an inbound `public.messages` row only after a safe reminder match.
- Update exactly one matched `public.reminders` row.
- Keep appointment booking and rescheduling out of scope.
- Avoid sending outbound replies.

This processor does not book appointments, reschedule appointments, call provider APIs, or send SMS.

## Current Function Path

The processor path is handled inside the `process-provider-event` Edge Function.

Current flow:

1. Authenticate the request.
2. Load the target `public.provider_events` row.
3. If `provider_events.clinic_id` is `null`, auto clinic mapping runs first.
4. The processing attempt is created only after `clinic_id` is known.
5. The caller should use explicit action `telnyx-inbound-response`.
6. The Telnyx inbound response processor runs for `message.received`.

The idempotency key remains:

```text
provider + ":" + provider_events.id + ":" + action
```

For this processor path, the expected action is:

```text
telnyx-inbound-response
```

## Event Type Handled

This processor handles only:

- `provider = "telnyx"`
- `event_type = "message.received"`

## Event Types Not Handled By This Processor

The following remain out of scope for this processor:

- Telnyx `message.sent`
- Telnyx `message.delivered`
- Telnyx `message.failed`
- Appointment booking or rescheduling texts.
- Vapi events.
- `call_logs` updates.
- Outbound SMS replies.

Telnyx `message.sent`, `message.delivered`, and `message.failed` are handled by the outbound message status processor.

## Matching Strategy

The processor extracts inbound payload fields from the raw Telnyx-like payload.

Inbound provider message id is extracted from:

1. `payload.data.payload.id`
2. `payload.data.payload.message_id`
3. `payload.resource_id`
4. `payload.data.id` as a fallback

Inbound body is extracted from:

1. `payload.data.payload.text`
2. `payload.data.payload.body`

Patient/source phone is extracted from:

- `payload.data.payload.from`

Clinic/destination phone is extracted from:

- `payload.data.payload.to`

After `clinic_id` is known, the processor:

1. Finds a patient by `clinic_id + phone`.
2. Finds the latest existing outbound Telnyx message for the same clinic and patient where:
   - `direction = "outbound"`
   - `reminder_id is not null`
   - `appointment_id is not null`
   - `status in ("sent", "delivered")`
3. Requires exactly one plausible outbound reminder message.

If no match is found:

- No inbound message is created.
- No reminder is updated.
- The processing attempt is marked `ignored`.
- The provider event is marked `ignored`.

If multiple plausible matches are found:

- No inbound message is created.
- No reminder is updated.
- The processing attempt is marked `ignored` with `ambiguous_match`.
- The provider event is marked `ignored`.

The processor does not infer a reminder from SMS text alone.

## Response Parsing

The processor normalizes the inbound body by:

- Trimming whitespace.
- Lowercasing.
- Removing diacritics.

Confirmed responses:

- `ÁNO`
- `ANO`
- `YES`
- `Y`

Declined responses:

- `NIE`
- `NO`
- `N`

Anything else non-empty becomes:

- `needs_review`

## Success Behavior

When exactly one safe outbound reminder message is matched, the processor creates one inbound `public.messages` row.

Inbound message shape:

- `direction = "inbound"`
- `provider = "telnyx"`
- `provider_message_id = inbound Telnyx message id`
- `body = inbound text`
- `status = "received"`
- `received_at` is set
- `reminder_id` copied from the matched outbound reminder message
- `patient_id` copied from the matched outbound reminder message
- `appointment_id` copied from the matched outbound reminder message
- `metadata.parsed_response`
- `metadata.provider_event_id`
- `metadata.matched_outbound_message_id`
- `metadata.template_key`, when available from the matched outbound message metadata

The processor then updates exactly one `public.reminders` row:

- `status = "responded"`
- `response_status = "confirmed" | "declined" | "needs_review"`
- `response_received_at` is set

It also updates provider processing state:

- `provider_events.processing_status = "processed"`
- `provider_events.processed_at` is set
- `provider_event_processing_attempts.status = "succeeded"`

## Duplicate And Idempotency Behavior

Raw event deduplication still happens through:

- `provider_events.unique(provider, provider_event_id)`

Processor idempotency still happens through:

- `provider_event_processing_attempts.idempotency_key`

The idempotency key format is:

```text
provider + ":" + provider_events.id + ":" + action
```

Current duplicate behavior:

- A second call for the same provider event and action returns `status = "duplicate"`.
- The existing processing attempt is returned.
- No second processing attempt is created.
- The attempt count stays `1`.

Inbound message duplicate protection:

- `messages_provider_message_unique_idx` protects `provider + provider_message_id + direction` when `provider_message_id` is present.
- The processor checks for an existing inbound message before insert.
- Duplicate inbound provider message ids are handled safely as `duplicate_inbound_message`.
- Duplicate handling does not create a second inbound message.

## Local Validation Results

Local validation used fake Telnyx payloads and local seeded/test data only.

Requested validation fixture:

- Fake Telnyx inbound `provider_event_id = "test-process-telnyx-inbound-response-001"`.
- Inbound `provider_message_id = "test-inbound-tomas-response-001"`.
- `from = "+420606777888"`.
- `to = "+421900000001"`.
- `text = "ÁNO"`.
- Matched existing outbound reminder message `provider_message_id = "test-msg-tomas-outbound"`.
- Created one inbound `messages` row.
- Inbound message metadata included `parsed_response = "confirmed"`.
- Reminder `50023896-11f6-47ba-97ab-27292aca9044` became:
  - `status = "responded"`
  - `response_status = "confirmed"`
- Provider processing attempt status became `succeeded`.
- Second call returned `duplicate`.
- Attempt count stayed `1`.

Additional local validation in this slice confirmed:

- A fake Telnyx inbound `message.received` with body `ÁNO` and patient phone `+421917333444` returned `processed`.
- One inbound message row was created.
- The matched reminder became `responded / confirmed`.
- `provider_events.processing_status` became `processed`.
- The processing attempt status became `succeeded`.
- A second call returned `duplicate`.
- Attempt count stayed `1`.
- Appointment and call-log counts stayed unchanged.
- A fake no-match phone returned `ignored` with `patient_not_found`.
- The no-match path created no inbound message and updated no reminder.
- A fake `NIE` response parsed as `declined`.

## Safety Notes

Safety boundaries:

- No appointment rows are updated.
- No `call_logs` rows are updated.
- No provider API calls are made.
- No SMS replies are sent.
- No raw provider payload is returned.
- No reminder is updated on no-match or ambiguous-match.
- Matching requires a mapped clinic and a patient phone match.
- This still relies on the webhook ingestion auth/signature boundary.

The processor is authenticated/internal and should not be treated as a public patient endpoint.

## Known Limitations

- Matching uses the latest outbound reminder message for the patient.
- That matching is acceptable for the local skeleton but needs stronger time-window or direct reply linkage before production.
- There is no phone normalization beyond exact match.
- There is no direct reply-to outbound provider message id linking yet.
- There is no transaction/RPC wrapper across inbound message insert, reminder update, provider event update, and attempt update.
- Production Telnyx signature verification is not implemented yet.
- There are no dedicated automated tests for this processor yet.

## Recommended Next Phase

Recommended next steps:

1. Add stricter time-window matching or direct provider reply linkage if Telnyx payloads support it.
2. Add validation coverage for `NIE` and `needs_review` paths.
3. Consider an RPC/transaction helper before adding more business side effects.
4. Add debug/read-only view filters for processed inbound responses if useful.
5. Wire this into real webhook processing only after Telnyx signature verification is complete.

## What Not To Do Next

- Do not book appointments from inbound SMS text.
- Do not reschedule appointments from inbound SMS text.
- Do not send automatic SMS replies yet.
- Do not process ambiguous matches.
- Do not connect production Telnyx webhooks without real signature verification.
- Do not expose raw provider payloads publicly.
