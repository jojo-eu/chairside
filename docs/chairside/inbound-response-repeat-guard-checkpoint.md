# Chairside Inbound Response Repeat Guard Checkpoint

This checkpoint summarizes the implemented repeat inbound reminder response guard in the Telnyx `message.received` processor.

## Purpose

The repeat guard prevents repeated inbound SMS responses from silently overwriting an existing reminder `response_status`.

It exists to:

- Preserve the first valid reminder response state.
- Keep later repeat responses as inbound message audit records.
- Distinguish same repeat responses from conflicting repeat responses.
- Avoid silent mutation when patients send follow-up SMS messages.

This guard does not send replies, update appointments, or process booking/rescheduling text.

## Current Behavior

For the first safe response to a reminder:

- Creates one inbound `public.messages` row.
- Updates the reminder:
  - `status = "responded"`
  - `response_status = parsed response`
  - `response_received_at = now()`
- Marks `provider_events.processing_status = "processed"`.
- Marks the processing attempt `status = "succeeded"`.
- Uses outcome `reminder_response_recorded`.

For a repeated safe response to the same reminder:

- Creates one inbound `public.messages` row if the inbound `provider_message_id` is new.
- Does not update `reminders.response_status`.
- Does not update `reminders.response_received_at`.
- Marks `provider_events.processing_status = "processed"`.
- Marks the processing attempt `status = "succeeded"`.
- Uses a repeat-specific outcome.

The repeat guard applies only after the inbound event has been safely matched to exactly one reminder.

## Repeat Outcomes

`repeat_same_response`:

- The new `parsed_response` equals the existing `reminders.response_status`.
- The reminder is not updated.
- The inbound message is recorded for audit.
- `needs_staff_review = false`.

`repeat_conflicting_response`:

- The new `parsed_response` differs from the existing `reminders.response_status`.
- The reminder is not updated.
- The inbound message is recorded for audit.
- `needs_staff_review = true`.

`duplicate_inbound_message`:

- The same inbound `provider_message_id` already exists.
- The duplicate is handled safely through the existing lookup and `messages_provider_message_unique_idx`.
- No duplicate inbound message is created.

## Inbound Message Metadata

Inbound message metadata now includes:

- `parsed_response`
- `provider_event_id`
- `matched_outbound_message_id`
- `repeat_response`
- `previous_response_status`, for repeat responses
- `repeat_outcome`, for repeat responses
- `needs_staff_review`, for repeat responses
- `template_key`, when available from the matched outbound message metadata

For a first response, `repeat_response = false`.

For a repeat same response:

```json
{
  "repeat_response": true,
  "previous_response_status": "confirmed",
  "repeat_outcome": "repeat_same_response",
  "needs_staff_review": false
}
```

For a repeat conflicting response:

```json
{
  "repeat_response": true,
  "previous_response_status": "confirmed",
  "repeat_outcome": "repeat_conflicting_response",
  "needs_staff_review": true
}
```

## Idempotency And Safety

Existing idempotency boundaries remain in place:

- `provider_event_processing_attempts.idempotency_key` prevents duplicate processing for the same provider event and action.
- `messages_provider_message_unique_idx` prevents duplicate inbound provider message rows for the same `provider + provider_message_id + direction`.

New repeat-response behavior:

- A different inbound `provider_message_id` for the same reminder is allowed as audit.
- That different inbound message no longer overwrites reminder response state.
- Repeat messages are recorded only after safe reminder matching.

Safety boundaries:

- No appointments are updated.
- No `call_logs` rows are updated.
- No provider API calls are made.
- No outbound SMS replies are sent.
- No raw provider payload is returned.

## Local Validation Results

Local validation used fake Telnyx `message.received` provider events and local test data only.

Validation scenario requested for this checkpoint:

- Existing reminder `response_status` was `needs_review`.
- Fake inbound repeat event used:
  - `provider_message_id = "test-inbound-repeat-guard-001"`
  - `text = "ANO"`
- The inbound body parsed as `confirmed`.
- An inbound `messages` row was created.
- Message metadata included:
  - `repeat_response = true`
  - `previous_response_status = "needs_review"`
  - `repeat_outcome = "repeat_conflicting_response"`
  - `needs_staff_review = true`
- The reminder `response_status` remained `needs_review`.
- The reminder `response_received_at` did not change.
- The provider event was marked `processed`.
- The processing attempt was marked `succeeded`.
- A duplicate second call returned `duplicate`.
- Attempt count stayed `1`.

Additional local validation in this implementation slice confirmed:

- First `ÁNO` produced `reminder_response_recorded`.
- The reminder became `responded / confirmed`.
- Second `ÁNO` with a different inbound `provider_message_id` produced `repeat_same_response`.
- The reminder stayed `responded / confirmed`.
- Third `NIE` with a different inbound `provider_message_id` produced `repeat_conflicting_response`.
- The third inbound message had `needs_staff_review = true`.
- The reminder still stayed `responded / confirmed`.
- Three inbound audit messages were created for the three different inbound provider message ids.
- Duplicate calls for each provider event returned `duplicate`.
- Appointment and call-log counts stayed unchanged.

## Known Limitations

- There is no staff review UI yet.
- There is no notification for conflicting repeat responses yet.
- There is no transaction/RPC wrapper across inbound message insert, reminder update, provider event update, and attempt update.
- There are no dedicated automated tests for this repeat guard yet.
- Matching still uses the local skeleton `latest_outbound_for_patient` strategy.
- Production Telnyx signature verification is not implemented yet.

## Recommended Next Phase

Recommended next steps:

1. Add documentation or UI surface for reviewing conflicting repeat responses.
2. Add no-match and ambiguous-match validation docs if needed.
3. Consider a transaction/RPC helper before adding more business side effects.
4. Improve matching with direct provider reply linkage or a stricter time window.
5. Add dedicated automated tests for repeat same and repeat conflicting responses.

## What Not To Do Next

- Do not silently overwrite prior `response_status`.
- Do not send automatic SMS replies.
- Do not reschedule appointments from repeat SMS text.
- Do not book appointments from repeat SMS text.
- Do not connect production Telnyx webhooks without real signature verification.
