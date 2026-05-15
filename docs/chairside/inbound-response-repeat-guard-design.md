# Chairside Inbound Response Repeat Guard Design

This design defines safe behavior for multiple inbound SMS responses that match the same Chairside reminder.

## Problem

Local validation showed that repeated inbound responses can overwrite `reminders.response_status`.

Example risk:

- A first valid response sets a reminder to `confirmed`.
- A later inbound response for the same reminder parses as `needs_review`.
- The current processor can overwrite `response_status` from `confirmed` to `needs_review`.

That behavior was acceptable for parser validation, but it is unsafe as a production default. A patient may send follow-up text, clarifications, corrections, or accidental duplicate messages, and those should not silently mutate the original response state.

## Current Behavior

The current Telnyx inbound `message.received` processor:

- Matches the latest outbound reminder message for a patient.
- Creates one inbound `public.messages` row.
- Updates the matched reminder:
  - `status = "responded"`
  - `response_status = parsed response`
  - `response_received_at = now()`
- Marks the provider event `processed`.
- Marks the provider event processing attempt `succeeded`.

Current idempotency behavior:

- `provider_event_processing_attempts` prevents duplicate processing of the same `provider_event + action`.
- `messages_provider_message_unique_idx` prevents duplicate inbound message rows for the same `provider + provider_message_id + direction`.

Important gap:

- A different inbound provider event with a different inbound `provider_message_id` can still match the same reminder and overwrite `reminders.response_status`.

## Desired Principle

The first valid reminder response should set the reminder response state.

Later responses should be preserved as inbound messages and audit context, but should not blindly overwrite reminder state.

Desired behavior:

- First valid response sets `reminders.response_status`.
- Later responses are recorded as inbound `messages` rows when safely matched.
- Later responses do not overwrite `response_status` by default.
- Ambiguous or conflicting follow-up responses become review/audit signals, not silent reminder mutation.

## Proposed Repeat Guard Rules

### First Response

If the reminder has not yet responded:

- `reminders.status` is not `responded`.
- `reminders.response_status is null`.

Then process normally:

- Insert inbound `messages` row.
- Update reminder to `status = "responded"`.
- Set `response_status` to the parsed response.
- Set `response_received_at`.
- Mark provider event `processed`.
- Mark attempt `succeeded`.
- Result outcome: `reminder_response_recorded`.

### Repeat Response

If the reminder already has `response_status`:

- Still create an inbound `messages` row if the inbound `provider_message_id` is new and the reminder match is safe.
- Do not overwrite `reminders.response_status` by default.
- Mark inbound message metadata with `repeat_response = true`.
- Store the new `parsed_response` in inbound message metadata.
- Store the previous reminder response status in metadata.
- Mark the provider event `processed`.
- Mark the attempt `succeeded`.

If the repeat parsed response equals the existing `reminders.response_status`:

- Do not update the reminder.
- Record the inbound message.
- Use result outcome `repeat_same_response`.
- Set `metadata.repeat_outcome = "repeat_same_response"`.
- `needs_staff_review` can remain `false`.

If the repeat parsed response differs from the existing `reminders.response_status`:

- Do not update the reminder automatically.
- Record the inbound message.
- Use result outcome `repeat_conflicting_response`.
- Set `metadata.repeat_outcome = "repeat_conflicting_response"`.
- Set `metadata.needs_staff_review = true`.

### Existing `needs_review`

If existing `reminders.response_status = "needs_review"`, there are two possible policies:

Option A: allow later clear `ÁNO` / `NIE` to upgrade the reminder response state.

- Benefit: a patient can clarify an ambiguous reply without staff intervention.
- Risk: free-form message order and provider delivery order can still produce surprising state changes.

Option B: never overwrite automatically once any response status exists.

- Benefit: simplest safe default; no silent mutation.
- Risk: staff must resolve a later clear reply manually.

Recommended default: Option B.

Do not overwrite an existing `needs_review` response automatically until Chairside has a staff review workflow or an explicit repeat-response policy.

## Suggested Metadata

Inbound `messages.metadata` should include:

- `parsed_response`
- `provider_event_id`
- `matched_outbound_message_id`
- `repeat_response`
- `previous_response_status`
- `repeat_outcome`
- `needs_staff_review`

Suggested first-response metadata:

```json
{
  "parsed_response": "confirmed",
  "provider_event_id": "uuid",
  "matched_outbound_message_id": "uuid",
  "repeat_response": false
}
```

Suggested repeat same-response metadata:

```json
{
  "parsed_response": "confirmed",
  "provider_event_id": "uuid",
  "matched_outbound_message_id": "uuid",
  "repeat_response": true,
  "previous_response_status": "confirmed",
  "repeat_outcome": "repeat_same_response",
  "needs_staff_review": false
}
```

Suggested repeat conflicting-response metadata:

```json
{
  "parsed_response": "needs_review",
  "provider_event_id": "uuid",
  "matched_outbound_message_id": "uuid",
  "repeat_response": true,
  "previous_response_status": "confirmed",
  "repeat_outcome": "repeat_conflicting_response",
  "needs_staff_review": true
}
```

## Provider Event And Attempt Behavior

If a repeat response is safely matched and recorded:

- `provider_events.processing_status = "processed"`.
- `provider_events.processed_at` is set.
- `provider_event_processing_attempts.status = "succeeded"`.
- The attempt result should distinguish the outcome.

Recommended attempt result outcomes:

- `reminder_response_recorded`
- `repeat_same_response`
- `repeat_conflicting_response`
- `duplicate_inbound_message`

If a repeat response is not safely matched:

- Do not create an inbound message.
- Do not update the reminder.
- Mark the attempt and provider event `ignored`, consistent with the current no-match behavior.

## Idempotency Interaction

Current idempotency boundaries remain useful:

- The same `provider_event + action` remains duplicate through `provider_event_processing_attempts.idempotency_key`.
- The same inbound provider message id remains guarded by `messages_provider_message_unique_idx`.
- A different inbound provider message id for the same reminder is allowed as audit, but must be guarded against reminder overwrite.

This means repeat guard logic is separate from provider event idempotency. It is a reminder-state safety rule, not a raw-event dedupe rule.

## Safety Rules

Repeat response handling should follow these rules:

- Never update multiple reminders.
- Never overwrite `confirmed` or `declined` with `needs_review` automatically.
- Never overwrite `declined` with `confirmed` automatically.
- Never overwrite `confirmed` with `declined` automatically.
- Never overwrite any existing response status without explicit staff action until a stronger product workflow exists.
- Do not send outbound replies in this slice.
- Do not book appointments from repeat responses.
- Do not reschedule appointments from repeat responses.

## Recommended Implementation Plan

Recommended implementation sequence:

1. Update the inbound processor to load the current reminder before inserting/updating.
2. Insert the inbound message with repeat metadata.
3. Update the reminder only if it has no prior `response_status`.
4. Return a repeat outcome if prior `response_status` exists.
5. Add local validation for repeat scenarios.

Recommended validation cases:

- First `ÁNO` sets `response_status = "confirmed"`.
- Second `ÁNO` records `repeat_same_response` without changing the reminder.
- Second `NIE` records `repeat_conflicting_response` without changing the reminder.
- Free text after `confirmed` records `repeat_conflicting_response` and `needs_staff_review = true` without changing the reminder.

## Known Limitations

- No staff review UI exists yet.
- No notification exists for conflicting repeat responses yet.
- There is no explicit audit table beyond `messages` and `provider_event_processing_attempts`.
- There is no transaction/RPC wrapper across inbound message insert, reminder update, provider event update, and attempt update.
- There is no production Telnyx signature verification yet.

## What Not To Do Next

- Do not silently overwrite prior reminder responses.
- Do not send automatic SMS replies.
- Do not implement staff conflict resolution UI in this slice.
- Do not process booking or rescheduling text.
- Do not treat repeat response handling as appointment command processing.
