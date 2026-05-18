# Chairside Accept Inbound Response RPC Checkpoint

This checkpoint summarizes the implemented `accept_inbound_response` staff review RPC.

## Purpose

`accept_inbound_response` is the second staff review RPC primitive.

It exists to:

- Accept the parsed inbound response as the source of truth.
- Update `public.reminders.response_status` atomically.
- Preserve and extend inbound message metadata as staff review audit.
- Keep reminder-changing writes out of the React client.
- Keep appointment, provider, and SMS side effects out of scope.

This differs from `keep_existing`, which records review metadata without changing the reminder response state.

## Function

Implemented function:

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

The returned JSON summarizes:

- RPC status.
- Inbound message id, clinic id, and reminder id.
- Reminder id, previous response status, and current response status.
- `staff_review_outcome` when relevant.

## Authorization And Security

Security behavior:

- Authenticated user is required through `auth.uid()`.
- The target inbound message must belong to a clinic in `current_clinic_ids()`.
- The related reminder must belong to the same clinic as the message.
- The function uses `SECURITY DEFINER`.
- The function sets a safe `search_path` to `public`.
- Execute is granted to `authenticated`.
- Execute is revoked from `anon`.
- Execute is revoked from `public`.
- No service-role client is used or assumed.

The explicit `current_clinic_ids()` check is the clinic authorization boundary.

## Validation Behavior

The function validates:

- Inbound message exists.
- `messages.direction = 'inbound'`.
- `messages.reminder_id is not null`.
- `messages.metadata->>'needs_staff_review' = 'true'`.
- `messages.metadata->>'staff_review_status'` is not already `resolved`.
- `messages.metadata->>'parsed_response'` is one of:
  - `confirmed`
  - `declined`
  - `needs_review`
- Related reminder exists.
- Related reminder belongs to the same clinic as the message.

Cancelled reminder behavior:

- If `reminders.status = 'cancelled'`, the function returns `cancelled_reminder`.
- No mutation occurs.

Stale state behavior:

- If `p_expected_current_reminder_response_status` is not null and the current reminder `response_status` is distinct from the expected value, the function returns `stale_reminder_state`.
- No mutation occurs.

Already resolved behavior:

- If `messages.metadata->>'staff_review_status' = 'resolved'`, the function returns `already_resolved`.
- No second mutation occurs.

Missing, inaccessible, or non-review rows return:

- `not_found`

## Write Behavior

The function updates `public.reminders`:

- `status = 'responded'`
- `response_status = parsed_response`
- `response_received_at = inbound messages.received_at` when present
- `response_received_at = now()` when the inbound message has no `received_at`

The function updates `public.messages.metadata` while preserving existing metadata.

Added metadata fields:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "accept_inbound_response"`
- `staff_reviewed_at`
- `staff_reviewed_by`
- `staff_review_note`, when provided
- `previous_reminder_response_status`
- `new_reminder_response_status`
- `previous_reminder_response_received_at`
- `new_reminder_response_received_at`

The function does not:

- Update appointments.
- Send SMS.
- Call Telnyx, Vapi, Telegram, OpenClaw, or any provider.
- Create a `chairside_activity_log` entry yet.

## Return Statuses

Possible statuses:

- `resolved`
- `already_resolved`
- `stale_reminder_state`
- `invalid_parsed_response`
- `cancelled_reminder`
- `not_found`

## Local Validation Results

Local SQL validation used authenticated DB context with a clinic member user via `request.jwt.claim.sub`.

### Stale Test

Message:

```text
7cdbf6cd-08b5-467e-99f8-c8abb1a2fe5a
```

Validation:

- Expected current reminder `response_status = confirmed`.
- Actual current reminder `response_status = needs_review`.
- Function returned `stale_reminder_state`.
- No mutation occurred.

### Resolved Test

Same message:

```text
7cdbf6cd-08b5-467e-99f8-c8abb1a2fe5a
```

Validation:

- Expected current reminder `response_status = needs_review`.
- Function returned `resolved`.
- `staff_review_outcome = accept_inbound_response`.
- Reminder `response_status` changed from `needs_review` to `confirmed`.

### Metadata Audit

The inbound message metadata gained:

- `staff_review_status = resolved`
- `staff_review_outcome = accept_inbound_response`
- `staff_reviewed_by` was set.
- `previous_reminder_response_status = needs_review`
- `new_reminder_response_status = confirmed`
- Previous `response_received_at` was captured.
- New `response_received_at` was captured.

### Reminder Validation

Validated reminder:

```text
a640641e-9bcd-4c9b-84c6-9188cc711126
```

Final reminder state:

- `status = responded`
- `response_status = confirmed`
- `response_received_at` used the inbound message `received_at`.

### Idempotency

Second call for the same message returned:

- `already_resolved`

It did not mutate the reminder again.

### Other Validation Paths

Cancelled reminder path:

```text
1933b40f-5e0c-49e5-aca5-d60759992184
```

Result:

- `cancelled_reminder`
- No mutation occurred.

Invalid parsed response path:

```text
f44b05a2-60bd-4c6a-b0ab-b566ea3ce24d
```

Result:

- `invalid_parsed_response`
- No mutation occurred.

## Safety

Current safety boundaries:

- No UI action is wired yet.
- No appointment updates.
- No provider calls.
- No SMS replies.
- No bulk action.
- No activity log entry yet.
- No schema, seed, or package changes beyond the RPC migration, declarative function definition, and grants.

## Known Limitations

- No UI button for `accept_inbound_response` exists yet.
- No staff note UI exists yet.
- No activity log entry is written yet.
- No dedicated `staff_review` table exists yet.
- No appointment or rescheduling logic exists, by design.

## Recommended Next Phase

Recommended next steps:

1. Keep this documentation checkpoint before adding UI.
2. Use the existing read-only visibility to inspect resolved metadata.
3. Add a separate `Prijať odpoveď zo SMS` UI button in a later slice.
4. Keep the accept action separate from `keep_existing`.
5. Add clear warning copy because the action changes `reminders.response_status`.
6. Test stale state in browser before enabling the UI action broadly.

## What Not To Do Next

- Do not combine this with appointment update or rescheduling.
- Do not send patient replies.
- Do not add bulk accept.
- Do not bypass `p_expected_current_reminder_response_status`.
- Do not update reminders directly from the client.
