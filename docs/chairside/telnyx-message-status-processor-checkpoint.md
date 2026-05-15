# Chairside Telnyx Message Status Processor Checkpoint

This checkpoint summarizes the current Telnyx outbound message status processor path in the `process-provider-event` Edge Function.

## Purpose

This is the first narrow business processor for Chairside provider events.

It exists to:

- Map Telnyx outbound message status events onto existing `public.messages` rows.
- Test the provider event processing audit and idempotency layer with a real, narrow business side effect.
- Keep inbound patient response handling out of scope.
- Avoid creating messages, reminders, appointments, or call logs from raw provider payloads.

This processor does not send SMS and does not call Telnyx APIs.

## Current Function Path

The processor path is handled inside the `process-provider-event` Edge Function.

Current flow:

1. Authenticate the request.
2. Load the target `public.provider_events` row.
3. If `provider_events.clinic_id` is `null`, auto clinic mapping runs first.
4. The processing attempt is created only after `clinic_id` is known.
5. The processor uses the existing processing attempt idempotency boundary.

The idempotency key remains:

```text
provider + ":" + provider_events.id + ":" + action
```

Auto clinic mapping still uses `public.provider_mappings` before the status processor runs. If mapping fails, the status processor does not run.

## Event Types Handled

The Telnyx outbound status processor handles only:

- `telnyx` `message.sent`
- `telnyx` `message.delivered`
- `telnyx` `message.failed`

## Event Types Explicitly Not Handled

The following remain out of scope:

- `telnyx` `message.received`
- Inbound patient replies.
- Vapi call events.
- Appointment updates.
- Call log updates.

Unsupported events continue through the classify-only ignored path.

## Message Matching Strategy

For handled Telnyx outbound status events, the processor extracts a provider message id from the raw payload in this order:

1. `payload.data.payload.id`
2. `payload.data.payload.message_id`
3. `payload.resource_id`
4. `payload.data.id` as a fallback

It then looks for one existing `public.messages` row where:

- `clinic_id = provider_events.clinic_id`
- `provider = "telnyx"`
- `provider_message_id = extracted provider message id`
- `direction = "outbound"`

If no matching message exists, the processor does not create a message.

## Status Mapping

Status events map to `messages.status` as follows:

- `message.sent` -> `sent`
- `message.delivered` -> `delivered`
- `message.failed` -> `failed`

For `message.sent`, `messages.sent_at` is set when it is currently `null`.

The current `messages` schema does not include `delivered_at` or `failed_at`, so those timestamps are not set in this slice.

The current processor does not update `reminders`.

When a message is updated, `messages.metadata.telnyx_status` records:

- `provider_event_id`
- `event_type`
- `provider_message_id`
- `processed_at`

## Missing Message Behavior

If the provider message id is missing or no matching outbound message row is found:

- The processing attempt is marked `ignored`.
- `provider_events.processing_status` is marked `ignored`.
- The attempt result explains the ignored outcome, including `message_not_found` when the provider message id was present but unmatched.
- No message row is created.
- No hard failure is returned.

This keeps unknown provider status events safe to replay and investigate without inventing business state.

## Success Behavior

When a matching outbound message row is found:

- Only that `messages` row is updated.
- The processing attempt status becomes `succeeded`.
- `provider_events.processing_status` becomes `processed`.
- `provider_events.processed_at` is set.
- The attempt result records `message_status_updated`.

Duplicate behavior is unchanged:

- Calling the same provider event with the same action again returns `status = "duplicate"`.
- No second processing attempt is created.
- The matching message is not updated again through the duplicate path.

## Local Validation Results

Local validation used fake Telnyx payloads and local seeded/test data only.

Confirmed delivered status flow:

- Used a fake Telnyx `message.delivered` provider event.
- The extracted `provider_message_id` matched existing local outbound message `test-msg-tomas-outbound`.
- `process-provider-event` auto-mapped the provider event to the clinic first.
- The matching message status updated to `delivered`.
- `provider_events.processing_status` became `processed`.
- The processing attempt status became `succeeded`.
- A second call with the same provider event and action returned `status = "duplicate"`.
- The processing attempt count stayed `1`.
- No appointments were changed.
- No call logs were changed.
- No provider API calls were made.
- No SMS was sent.

Additional local checks confirmed:

- `message.sent` can update a matching outbound message to `sent`.
- `message.failed` can update a matching outbound message to `failed`.
- Unknown `provider_message_id` returns an ignored outcome and does not create a message.
- `message.received` remains out of scope and is handled by the classify-only ignored path.

## Security And Safety Notes

The function remains authenticated and internal.

Safety boundaries:

- The Telnyx signature verification boundary exists at webhook ingestion.
- This processor does not independently verify Telnyx signatures.
- Only existing outbound `messages` rows are updated.
- No raw provider payload is returned.
- No provider APIs are called.
- No SMS is sent.
- No reminders, appointments, or call logs are updated.

Provider payloads should still be treated as untrusted until production signature verification and mapping rules are complete.

## Known Limitations

- No inbound response processing yet.
- No `message.received` processor yet.
- No reminder status update yet.
- No `delivered_at` or `failed_at` update because the current `messages` schema does not include those columns.
- No transaction or RPC wrapper across message, attempt, and provider event updates.
- No retry queue or scheduler.
- No production Telnyx signature verification implementation yet.

## Recommended Next Phase

Recommended next steps:

1. Add a Telnyx inbound `message.received` processor only after explicit reminder/message matching rules are defined.
2. Optionally add reminder updates for outbound delivery failures if product behavior requires it.
3. Consider a transaction/RPC helper before adding more business side effects.
4. Keep every provider processor narrow, auditable, and idempotent.

## What Not To Do Next

- Do not process inbound patient replies without explicit reminder/message matching.
- Do not book appointments from provider events.
- Do not update reminders broadly from raw provider payloads.
- Do not expose provider payloads publicly.
- Do not store provider secrets in the database.
- Do not turn provider event processing into a generic workflow engine.
