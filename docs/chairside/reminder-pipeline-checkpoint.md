# Chairside Reminder Pipeline Checkpoint

This checkpoint summarizes the current Chairside reminder pipeline state.

## Current Reminder Pipeline Scope

The current reminder pipeline is an internal, authenticated state-transition flow for local validation and future integration work. It models appointment reminder scheduling, outbound reminder marking, and inbound patient response recording inside Supabase.

It is not a real SMS delivery system yet. No function currently calls Telnyx, verifies webhook signatures, sends SMS, runs on a cron schedule, or updates appointment status based on patient response.

## Current Implemented Flow

The implemented flow is:

1. `book-appointment` creates an appointment.
2. `book-appointment` creates one pending reminder for that appointment.
3. `book-appointment` writes one `appointment.created` row to `public.chairside_activity_log`.
4. `mark-reminder-sent` changes an existing reminder to `sent`.
5. `mark-reminder-sent` creates one outbound `public.messages` row.
6. `receive-reminder-response` creates one inbound `public.messages` row.
7. `receive-reminder-response` updates the reminder to `responded` with a parsed `response_status`.

The reminder created by booking uses:

- `status = "pending"`
- `channel = "sms"`
- `template_key = "appointment_confirmation_24h"`
- `scheduled_for = starts_at - 24 hours`, clamped to `now()` if that would be in the past

## Current Tables Used

The current reminder pipeline touches or depends on:

- `appointments`
- `reminders`
- `messages`
- `chairside_activity_log`
- `patients`
- `services`
- `clinics`

`appointments`, `patients`, `services`, `clinics`, and existing RLS policies provide the validated booking context. `reminders` tracks reminder state. `messages` stores outbound and inbound communication records. `chairside_activity_log` currently records appointment creation only.

## Edge Functions Implemented

Current Chairside booking/reminder Edge Functions:

- `check-availability`
- `book-appointment`
- `mark-reminder-sent`
- `receive-reminder-response`

All current reminder pipeline functions use the existing Supabase JWT middleware pattern and validate access by loading scoped data through the user-scoped Supabase client before privileged writes.

## `mark-reminder-sent` Summary

Purpose: mark one existing reminder as sent and create one outbound message record. This represents an internal state transition after a delivery provider would have accepted or sent the message. It does not send a real SMS.

Request:

```json
{
  "clinic_id": "uuid",
  "reminder_id": "uuid",
  "provider": "system",
  "provider_message_id": "optional-provider-id",
  "body": "Optional outbound body"
}
```

Required fields:

- `clinic_id`
- `reminder_id`

Optional fields:

- `provider`, default `system`
- `provider_message_id`
- `body`

Supported `provider` values match the current `messages.provider` schema:

- `system`
- `manual`
- `telnyx`

Successful response:

```json
{
  "reminder": {
    "id": "uuid",
    "status": "sent",
    "sent_at": "timestamp"
  },
  "message": {
    "id": "uuid",
    "direction": "outbound",
    "status": "sent"
  }
}
```

State transition:

- Loads the reminder through the user-scoped Supabase client and RLS.
- Rejects reminders outside the requested clinic.
- Rejects `cancelled` reminders.
- Updates the reminder:
  - `status = "sent"`
  - `sent_at = now()`
- Creates one `public.messages` row:
  - `clinic_id`
  - `patient_id`
  - `appointment_id`
  - `reminder_id`
  - `direction = "outbound"`
  - `channel = reminder.channel`
  - `provider = provided provider or "system"`
  - `provider_message_id`, when provided
  - `body = provided body or a simple generated placeholder`
  - `status = "sent"`
  - `sent_at = now()`
  - `metadata.local_internal = true`
  - `metadata.template_key = reminder.template_key`

## `receive-reminder-response` Summary

Purpose: record an inbound patient response for an existing reminder. This is an internal/test harness for response recording, not a public patient endpoint and not a Telnyx webhook.

Request:

```json
{
  "clinic_id": "uuid",
  "reminder_id": "uuid",
  "body": "ÁNO",
  "provider": "system",
  "provider_message_id": "optional-provider-id"
}
```

Required fields:

- `clinic_id`
- `reminder_id`
- `body`

Optional fields:

- `provider`, default `system`
- `provider_message_id`

Successful response:

```json
{
  "reminder": {
    "id": "uuid",
    "status": "responded",
    "response_status": "confirmed",
    "response_received_at": "timestamp"
  },
  "message": {
    "id": "uuid",
    "direction": "inbound",
    "status": "received"
  },
  "parsed_response": "confirmed"
}
```

State transition:

- Loads the reminder through the user-scoped Supabase client and RLS.
- Rejects reminders outside the requested clinic.
- Rejects `cancelled` reminders.
- Rejects empty response bodies.
- Creates one `public.messages` row:
  - `clinic_id`
  - `patient_id`
  - `appointment_id`
  - `reminder_id`
  - `direction = "inbound"`
  - `channel = reminder.channel`
  - `provider = provided provider or "system"`
  - `provider_message_id`, when provided
  - `body`
  - `status = "received"`
  - `received_at = now()`
  - `metadata.parsed_response = parsed response_status`
  - `metadata.template_key = reminder.template_key`
- Updates the reminder:
  - `status = "responded"`
  - `response_status = parsed response_status`
  - `response_received_at = now()`

## Response Parsing Rules

`receive-reminder-response` trims, lowercases, and removes diacritics before parsing.

Current parsing:

- `ÁNO`, `ANO`, `yes`, `y` -> `confirmed`
- `NIE`, `no`, `n` -> `declined`
- Any other non-empty response -> `needs_review`

`STOP` / opt-out parsing is not implemented yet.

## Local Validation Results

Local validation has confirmed:

- `mark-reminder-sent` returned HTTP `200`.
- The reminder changed to `sent`.
- The reminder `sent_at` value was set.
- One outbound `public.messages` row was created.
- `receive-reminder-response` recorded inbound body `ÁNO`.
- One inbound `public.messages` row was created with `metadata.parsed_response = "confirmed"`.
- The reminder changed to `status = "responded"` and `response_status = "confirmed"`.
- A non-empty ambiguous response was recorded as `needs_review`.

Validation used local fake/test data only.

## Known Limitations

- No real SMS sending yet.
- No Telnyx webhook yet.
- No webhook signature verification yet.
- No idempotency yet.
- No transaction wrapper between reminder/message writes.
- No appointment status update from patient response yet.
- No automatic cron/scheduler yet.
- No `provider_events` table yet.
- No opt-out handling in `receive-reminder-response` yet.
- No public patient endpoint yet.

Current transaction limitation:

- `mark-reminder-sent` updates `reminders` and then inserts `messages` as separate writes. If message insertion fails after the reminder update, the function returns a clear `message_create_failed` error but the reminder may already be `sent`.
- `receive-reminder-response` inserts `messages` and then updates `reminders` as separate writes. If the reminder update fails after message insertion, the function returns a clear `reminder_update_failed` error but the inbound message may already exist.

Adding an atomic transaction would require a database RPC or schema change, which is intentionally deferred.

## Recommended Next Phase

Recommended branch:

```text
codex/chairside-send-reminder-harness
```

Recommended next sequence:

1. Add a `send-reminder` skeleton or internal test harness that finds a pending reminder and calls the current state-transition path without real SMS.
2. Later add controlled Telnyx integration only after local state transitions are stable.
3. Later add `provider_events` and idempotency tables for webhook/provider reliability.
4. Later add UI affordance for reminder response status and review-needed handling.

## What Not To Do Next

- Do not build generic campaign automation.
- Do not introduce broad workflow engine UI.
- Do not connect real Telnyx before local state transitions are stable.
- Do not expose the service role to the frontend.
- Do not call Telnyx, Vapi, Telegram, OpenClaw, or provider SDKs directly from React.
- Do not add public patient endpoints before webhook authentication and abuse controls exist.
- Do not implement reminder campaigns, segmentation, waitlists, or marketing automation as part of this pipeline.
