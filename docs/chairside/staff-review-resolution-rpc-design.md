# Chairside Staff Review Resolution RPC Design

This design document defines a future atomic server-side primitive for resolving inbound response staff-review conflicts.

## Purpose

Chairside can now display inbound response conflicts with useful context, but resolution writes should not be added directly from the UI.

This document defines a future RPC or Edge Function wrapper that can resolve one inbound response review safely, atomically, and audibly before `/internal/inbound-responses` gains write actions.

## Problem

The `/internal/inbound-responses` UI can now show:

- Inbound response rows.
- Repeat/conflict metadata.
- Patient context.
- Appointment context.
- Reminder context.
- Rows where `metadata.needs_staff_review = true`.

Future staff resolution will likely need to write to:

- `public.messages`, to mark the inbound message reviewed and store resolution metadata.
- `public.reminders`, for explicit response status changes.
- `public.chairside_activity_log`, for an audit trail.

Doing those writes as separate client-side mutations is unsafe because:

- Partial writes could leave the message and reminder out of sync.
- Reminder state could change after the UI loaded.
- Duplicate submits could mutate state twice.
- Client-side write paths are harder to audit and constrain.

## Desired Primitive

Create one future server-side primitive:

- A single Postgres DB function/RPC, or
- An Edge Function wrapper around one DB transaction.

The primitive should:

- Resolve exactly one inbound response review at a time.
- Require an explicit resolution outcome.
- Run atomically in one transaction.
- Enforce authorization internally.
- Preserve existing metadata.
- Write a clear audit trail.

The UI should call this primitive rather than issuing direct multi-step writes.

## Proposed Inputs

Proposed inputs:

- `inbound_message_id uuid`
- `resolution_outcome text`
- `staff_review_note text` optional
- `expected_current_reminder_response_status text`
- `expected_message_updated_at timestamptz` optional future input if `messages.updated_at` or an equivalent version marker exists later

Allowed `resolution_outcome` values:

- `keep_existing`
- `accept_inbound_response`
- `mark_needs_review`
- `ignore_inbound`

The first implementation can omit `expected_message_updated_at` because `public.messages` currently has `created_at` but no `updated_at`.

## Authorization

Authorization requirements:

- Authenticated user only.
- The inbound message must belong to a clinic visible to the authenticated user.
- The reminder must belong to the same clinic as the message.
- The function should use the `current_clinic_ids()` pattern where appropriate.
- The client must not use service role.
- The RPC should enforce clinic ownership internally, even if the caller passes ids manually.

Recommended authorization checks:

1. Load the inbound message by id.
2. Reject if `messages.clinic_id not in (select current_clinic_ids())`.
3. Load the reminder by `messages.reminder_id`.
4. Reject if `reminders.clinic_id != messages.clinic_id`.
5. Reject if `reminders.clinic_id not in (select current_clinic_ids())`.

If implemented as an Edge Function, it should still validate the authenticated user and should not trust client-provided clinic ids.

## Validation Rules

The primitive should validate:

- Inbound message exists.
- `messages.direction = "inbound"`.
- `messages.reminder_id is not null`.
- Reminder exists.
- Reminder belongs to the same clinic as the message.
- `messages.metadata.parsed_response` exists for `accept_inbound_response`.
- `messages.metadata.needs_staff_review = true` for conflict workflows, though `keep_existing` may be allowed for rows already reviewed by future policy.
- `resolution_outcome` is one of the allowed values.
- `expected_current_reminder_response_status` matches the reminder's current `response_status`.
- The inbound message has not already been resolved unless an explicit override is designed later.

Stale-state rule:

- If current reminder `response_status` differs from `expected_current_reminder_response_status`, return `stale_reminder_state` and do not mutate.

Already-resolved rule:

- If inbound message metadata already has `staff_review_status = "resolved"`, return `already_resolved` and do not mutate again.

## Proposed Writes By Outcome

All outcomes should update inbound message metadata while preserving existing metadata.

### keep_existing

Reminder writes:

- Do not change `reminders.response_status`.
- Do not change `reminders.response_received_at`.

Message metadata writes:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "keep_existing"`

### accept_inbound_response

Required parsed response:

- Use `messages.metadata.parsed_response`.

Reminder writes:

- Set `reminders.response_status = parsed_response`.
- Keep or set `reminders.status = "responded"`.
- Set `reminders.response_received_at` to the inbound message `received_at` when present.
- If inbound `received_at` is null, use a defined fallback such as transaction `now()`.

Recommended timestamp behavior:

- Prefer inbound `messages.received_at`, because it represents when the patient actually responded.

Message metadata writes:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "accept_inbound_response"`

### mark_needs_review

Reminder writes:

- Set `reminders.response_status = "needs_review"`.
- Keep or set `reminders.status = "responded"`.
- Decide separately whether `response_received_at` should change; default should preserve the existing timestamp unless product rules say otherwise.

Message metadata writes:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "mark_needs_review"`

### ignore_inbound

Reminder writes:

- Do not change the reminder.

Message metadata writes:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "ignore_inbound"`

## Required Metadata And Audit

The function must preserve all existing inbound message metadata.

Add metadata keys:

- `staff_review_status`
- `staff_review_outcome`
- `staff_reviewed_at`
- `staff_reviewed_by`
- `staff_review_note`
- `previous_reminder_response_status`
- `new_reminder_response_status`

Recommended metadata semantics:

- `staff_review_status = "resolved"` for completed resolution.
- `staff_reviewed_at = now()`.
- `staff_reviewed_by = auth.uid()`.
- `previous_reminder_response_status` stores the reminder state before resolution.
- `new_reminder_response_status` stores the reminder state after resolution, even if unchanged.
- `staff_review_note` is nullable but should preserve the provided note when present.

Activity log:

- Write one `public.chairside_activity_log` row if the table shape supports it.
- Suggested `actor_type = "user"`.
- Suggested `actor_id = auth.uid()`.
- Suggested `actor_label` from authenticated user email if available, otherwise a safe fallback.
- Suggested `action = "inbound_response.review_resolved"`.
- Suggested `entity_type = "message"`.
- Suggested `entity_id = inbound_message_id`.
- `details` should include:
  - `inbound_message_id`
  - `reminder_id`
  - `resolution_outcome`
  - `previous_reminder_response_status`
  - `new_reminder_response_status`
  - `staff_review_note` when present

## Concurrency And Idempotency

The primitive should protect against stale UI and duplicate submits.

Concurrency rules:

- Require `expected_current_reminder_response_status`.
- Compare it with the current reminder `response_status` inside the transaction.
- Return `stale_reminder_state` without mutation when it differs.

Idempotency rules:

- Do not allow resolving an already resolved message by default.
- Repeated submit after a successful resolution should return `already_resolved`.
- `already_resolved` should not write another activity log row.
- Future override/reopen behavior should be explicitly designed before implementation.

The RPC/transaction is preferred over client-side multi-write because it can lock/read/update all involved rows consistently.

## Return Shape

Recommended return shape:

```json
{
  "status": "resolved",
  "inbound_message": {
    "id": "uuid",
    "clinic_id": "uuid",
    "reminder_id": "uuid",
    "staff_review_status": "resolved",
    "staff_review_outcome": "keep_existing"
  },
  "reminder": {
    "id": "uuid",
    "clinic_id": "uuid",
    "status": "responded",
    "response_status": "needs_review",
    "response_received_at": "timestamp"
  },
  "activity_log_id": "uuid"
}
```

Allowed statuses:

- `resolved`
- `already_resolved`
- `stale_reminder_state`
- `invalid_request`

Errors should be safe and should not expose raw provider payloads or secrets.

## Safety Rules

The primitive must not:

- Update appointments.
- Send SMS.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Resolve multiple rows in one request.
- Automatically resolve without explicit staff outcome.
- Expose raw `provider_events.payload`.
- Accept arbitrary text as appointment booking.
- Accept arbitrary text as appointment rescheduling.
- Trust client-provided clinic ids.

The primitive should only resolve the review state for one inbound message and, when explicitly requested, the linked reminder response state.

## Implementation Order Recommendation

Recommended order:

1. Create this RPC design first.
2. Implement the DB function and migration.
3. Add RLS-safe local tests for valid, stale, unauthorized, and already-resolved paths.
4. Add one UI action first:
   - `keep_existing`, metadata-only.
5. Add `accept_inbound_response` after the metadata-only path is validated.
6. Add `mark_needs_review` and `ignore_inbound`.
7. Keep the UI under the internal/debug route until the audit behavior is proven.

Do not add write buttons to `/internal/inbound-responses` before the server-side primitive exists.

## Known Open Questions

Open questions before implementation:

- Exact `chairside_activity_log.action` naming.
- Whether staff review state should stay in `messages.metadata` or move to a dedicated `staff_review` table later.
- Whether `response_received_at` should become inbound `messages.received_at` or review time for `accept_inbound_response`.
- Whether `needs_review` can be accepted as a final staff outcome.
- Whether `staff_review_note` should be required for conflicting changes.
- Whether a future `messages.updated_at` or version column is needed for message-level stale checks.

## What Not To Do Next

- Do not add UI write buttons before the RPC exists.
- Do not write reminder updates directly from the client.
- Do not send patient replies.
- Do not update appointments.
- Do not process booking text.
- Do not process rescheduling text.
- Do not bulk-resolve review rows.
