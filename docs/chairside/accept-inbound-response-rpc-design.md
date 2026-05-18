# Chairside Accept Inbound Response RPC Design

This design defines the future server-side workflow for accepting an inbound parsed response and intentionally updating `reminders.response_status`.

## Purpose

The existing `keep_existing` staff review path records review metadata and leaves the reminder unchanged.

`accept_inbound_response` is different: it intentionally changes `reminders.response_status` to the parsed inbound response. Because it changes business state, it needs stricter validation, an atomic server-side write path, stale-state protection, and clear audit metadata.

## Problem

Current state:

- `resolve_inbound_response_keep_existing` can resolve a review without changing the reminder.
- `/internal/inbound-responses` can show review context and trigger `keep_existing`.
- Conflicting inbound responses can remain visible as resolved historical conflicts.

Future `accept_inbound_response` must:

- Update `reminders.response_status`.
- Preserve the inbound message as the audit source.
- Avoid client-side multi-write behavior.
- Avoid accidental appointment, provider, or SMS side effects.

This should be implemented as a narrow RPC, not as direct UI writes.

## Proposed Function

Proposed RPC:

```sql
public.resolve_inbound_response_accept_inbound(
  p_inbound_message_id uuid,
  p_expected_current_reminder_response_status text default null,
  p_staff_review_note text default null
)
```

Return type:

```sql
jsonb
```

The returned JSON should summarize:

- Resolution status.
- Inbound message id, clinic id, reminder id, and staff review outcome.
- Reminder id, previous response state, new response state, and response timestamp.

## Allowed Parsed Responses

Allowed `messages.metadata->>'parsed_response'` values:

- `confirmed`
- `declined`
- `needs_review`

Behavior:

- Reject missing `parsed_response`.
- Reject null or empty `parsed_response`.
- Reject unsupported values.
- Return `invalid_parsed_response` for missing or unsupported values.

`needs_review` should be allowed, but the UI should make clear that accepting it sets the reminder to a review state rather than a final patient confirmation/decline.

## Authorization And Security

Security requirements:

- Authenticated user only.
- `auth.uid()` is required and should be used for audit metadata.
- The inbound message `clinic_id` must be in `current_clinic_ids()`.
- The reminder must belong to the same clinic as the inbound message.
- Execute should be granted only to `authenticated`.
- Anonymous execute should be revoked.
- The function should use a safe `search_path`.
- No service-role client should be used from the UI.

Recommended implementation:

- Use `SECURITY DEFINER` only if needed for controlled writes.
- Enforce clinic membership explicitly with `current_clinic_ids()`.
- Do not trust any client-provided clinic id.
- Do not expose raw provider payloads or provider secrets in errors.

## Validation Rules

The RPC should validate:

- Inbound message exists.
- `messages.direction = 'inbound'`.
- `messages.reminder_id is not null`.
- `messages.metadata->>'needs_staff_review'` is `true`.
- `messages.metadata->>'staff_review_status'` is not `resolved`.
- `messages.metadata->>'parsed_response'` exists and is one of the allowed parsed responses.
- Related reminder exists.
- Related reminder belongs to the same clinic as the message.
- Reminder clinic is accessible through `current_clinic_ids()`.
- Reminder is not cancelled.

Stale-state validation:

- If `p_expected_current_reminder_response_status` is provided and the current reminder `response_status` is distinct from it, return `stale_reminder_state`.
- Do not mutate either row on stale state.

Cancelled reminder validation:

- If `reminders.status = 'cancelled'`, return `cancelled_reminder`.
- Do not mutate either row unless a future product rule explicitly allows this.

Already-resolved validation:

- If `messages.metadata->>'staff_review_status' = 'resolved'`, return `already_resolved`.
- Do not mutate again.

## Write Behavior

All writes should happen in one RPC transaction.

Reminder update:

- `status = 'responded'`
- `response_status = messages.metadata->>'parsed_response'`
- `response_received_at = messages.received_at` when present
- `response_received_at = now()` when `messages.received_at` is null

Recommended timestamp rule:

- Prefer inbound `messages.received_at`, because it represents when the patient actually responded.
- Use transaction `now()` only as a fallback.

Inbound message metadata update:

- Preserve all existing metadata.
- Add or overwrite:
  - `staff_review_status = "resolved"`
  - `staff_review_outcome = "accept_inbound_response"`
  - `staff_reviewed_at`
  - `staff_reviewed_by`
  - `staff_review_note`, when provided
  - `previous_reminder_response_status`
  - `new_reminder_response_status`
  - `previous_reminder_response_received_at`
  - `new_reminder_response_received_at`

This RPC must not:

- Update appointments.
- Send SMS replies.
- Call provider APIs.
- Create provider events.
- Process booking or rescheduling text.

## Return Statuses

Expected statuses:

- `resolved`
- `already_resolved`
- `stale_reminder_state`
- `invalid_parsed_response`
- `cancelled_reminder`
- `not_found`

Return payload should include safe summaries only, for example:

```json
{
  "status": "resolved",
  "inbound_message": {
    "id": "uuid",
    "clinic_id": "uuid",
    "reminder_id": "uuid",
    "staff_review_status": "resolved",
    "staff_review_outcome": "accept_inbound_response"
  },
  "reminder": {
    "id": "uuid",
    "clinic_id": "uuid",
    "status": "responded",
    "previous_response_status": "needs_review",
    "response_status": "confirmed",
    "response_received_at": "timestamp"
  }
}
```

## Concurrency And Idempotency

The RPC should provide transaction-level protection.

Recommended approach:

- Load and lock the inbound message row if needed.
- Load and lock the reminder row if needed.
- Check `staff_review_status` before writing.
- Check expected reminder response state before writing.
- Update reminder and inbound message metadata in the same transaction.

Rules:

- Already resolved returns `already_resolved`.
- Stale reminder state returns `stale_reminder_state` without mutation.
- Repeated submit after resolution must not re-update the reminder timestamp.
- Repeated submit must not write a second audit mutation.

This is why the UI should call the RPC rather than performing separate client-side writes.

## Audit

The RPC should preserve original inbound message metadata.

Audit metadata should include:

- `staff_review_status`
- `staff_review_outcome`
- `staff_reviewed_at`
- `staff_reviewed_by`
- `staff_review_note`
- `previous_reminder_response_status`
- `new_reminder_response_status`
- `previous_reminder_response_received_at`
- `new_reminder_response_received_at`

Returned summary should include:

- `inbound_message_id`
- `reminder_id`
- Previous reminder response status.
- New reminder response status.

Optional future audit:

- Add one `public.chairside_activity_log` row after the table semantics and event naming are confirmed.
- Include `inbound_message_id`, `reminder_id`, and `staff_review_outcome` in activity log metadata.

## UI Implications

Future UI action should be separate from `keep_existing`.

Possible button label:

```text
Prijať odpoveď z SMS
```

UI requirements:

- Show current reminder context before the action.
- Show inbound parsed response before the action.
- Show a warning that this changes `reminders.response_status`.
- Optionally collect `staff_review_note`.
- Pass the current reminder `response_status` as the stale-state expectation.
- Refresh messages and detail context after success.
- After success, the row should leave the unresolved review filter and remain visible in default view as resolved.

This action should not be added until the RPC is implemented and locally validated.

## Safety Rules

The accept RPC and future UI action must not:

- Update appointments.
- Book or reschedule appointments.
- Send outbound SMS.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Resolve multiple rows in one call.
- Accept arbitrary free text as an appointment action.
- Bypass `current_clinic_ids()` checks.

The only intended business mutation is:

- `messages.metadata.parsed_response` to `reminders.response_status`

## Testing Plan

Recommended local validation:

1. Create an unresolved review row with allowed `parsed_response`.
2. Verify the stale expected status path returns `stale_reminder_state`.
3. Verify missing `parsed_response` returns `invalid_parsed_response`.
4. Verify unsupported `parsed_response` returns `invalid_parsed_response`.
5. Verify cancelled reminder path returns `cancelled_reminder` if a safe local fixture exists.
6. Verify successful path updates `reminders.response_status`.
7. Verify successful path sets `reminders.status = responded`.
8. Verify successful path sets `response_received_at` from inbound `messages.received_at` when present.
9. Verify inbound message metadata includes staff review audit fields.
10. Verify a second call returns `already_resolved` and does not mutate reminder timestamp again.

## Known Open Questions

- Should `response_received_at` always use inbound `messages.received_at`, or should staff review time ever be used? Recommendation: use inbound `received_at`.
- Should accepting `needs_review` be allowed? Recommendation: allow it, but document clearly that it sets the reminder to a review state.
- Should `chairside_activity_log` be required before the UI action? Recommendation: not required for the first RPC if metadata audit is complete, but revisit before production.
- Should staff notes be required for conflicting updates? Recommendation: optional initially, required later for high-risk transitions if staff workflow needs it.

## What Not To Do Next

- Do not combine `accept_inbound_response` with appointment changes.
- Do not send SMS replies.
- Do not add the UI write action before the RPC is implemented and tested.
- Do not update reminders directly from the client.
- Do not bypass `current_clinic_ids()` checks.
- Do not treat inbound free text as booking or rescheduling intent in this workflow.
