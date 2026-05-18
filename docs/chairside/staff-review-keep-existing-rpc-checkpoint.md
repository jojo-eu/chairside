# Chairside Staff Review Keep Existing RPC Checkpoint

This checkpoint summarizes the implemented `keep_existing` staff review RPC for inbound reminder response conflicts.

## Purpose

This is the first safe staff review write primitive for Chairside inbound response conflicts.

It exists to:

- Resolve a conflicting inbound response as `keep_existing`.
- Record staff review metadata on the inbound `public.messages` row.
- Preserve existing inbound message metadata.
- Avoid changing `reminders.response_status`.

This is intentionally narrow. It does not implement `accept_inbound_response`, `mark_needs_review`, or `ignore_inbound` yet.

## Function

Implemented function:

```sql
public.resolve_inbound_response_keep_existing(
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
- Reminder id and current `response_status`.
- `staff_review_outcome` when applicable.

## Authorization And Security

Security behavior:

- Authenticated user is required.
- The function uses `auth.uid()`.
- The target message must belong to a clinic in `current_clinic_ids()`.
- The related reminder must belong to the same clinic as the message.
- The function is granted to `authenticated`.
- Anonymous execution is revoked.
- No service-role client is used or assumed.
- The function uses a safe `search_path`.

Implementation notes:

- The function uses `SECURITY DEFINER` so it can perform the controlled metadata update while enforcing its own clinic membership check.
- The explicit `current_clinic_ids()` check is the authorization boundary.
- Anonymous REST/RPC access was validated to return permission denied.

## Validation Behavior

The function validates:

- Inbound message exists.
- `messages.direction = "inbound"`.
- `messages.reminder_id is not null`.
- Message clinic is accessible to the current user through `current_clinic_ids()`.
- Related reminder exists.
- Reminder belongs to the same clinic as the message.

Stale state behavior:

- If `p_expected_current_reminder_response_status` is not null and the current reminder `response_status` is distinct from the expected value, the function returns `stale_reminder_state`.
- No mutation occurs on stale state.

Already resolved behavior:

- If `messages.metadata->>'staff_review_status' = 'resolved'`, the function returns `already_resolved`.
- No second mutation occurs.

Missing or inaccessible records return:

- `not_found`

## Write Behavior

The function updates only:

- `public.messages.metadata`

It preserves existing metadata and adds:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "keep_existing"`
- `staff_reviewed_at`
- `staff_reviewed_by`
- `staff_review_note`, when provided
- `previous_reminder_response_status`
- `new_reminder_response_status`

It does not:

- Update `public.reminders`.
- Update `public.appointments`.
- Send messages.
- Call providers.
- Write `public.chairside_activity_log` in this first primitive.

Activity logging was skipped intentionally to keep the first write primitive minimal and focused on safe metadata-only resolution.

## Return Statuses

Possible statuses:

- `resolved`
- `already_resolved`
- `stale_reminder_state`
- `not_found`

## Local Validation Results

Local validation used an authenticated DB/RPC context with clinic member user:

```text
736f2717-0c81-4bf6-ab28-f960c2d686fc
```

Validated inbound message:

```text
db44e3c9-f489-4e04-85d9-ed6b7d4e6a59
```

Provider message id:

```text
test-repeat-inbound-nie-1778850279
```

Validation result:

- First valid call returned `status = "resolved"`.
- Message metadata gained `staff_review_status = "resolved"`.
- Message metadata gained `staff_review_outcome = "keep_existing"`.
- `staff_reviewed_by` was set.
- `previous_reminder_response_status = "confirmed"`.
- `new_reminder_response_status = "confirmed"`.
- Reminder `response_status` remained `confirmed`.
- Second call returned `already_resolved`.

Additional local validation for the same function shape confirmed:

- A stale expected response status returned `stale_reminder_state`.
- Anonymous RPC execution was denied after explicit anon revoke.
- Authenticated duplicate execution continued to return `already_resolved`.

## Migration Note

Local migration history needed repair after removing a duplicate revoke migration during development.

Final committed migration state:

- Single keep_existing RPC migration.
- Declarative schema updated in:
  - `supabase/schemas/02_functions.sql`
  - `supabase/schemas/06_grants.sql`

## Known Limitations

- Only `keep_existing` is implemented.
- No UI action is wired yet.
- No `chairside_activity_log` row is created yet.
- No `accept_inbound_response` RPC exists yet.
- No `mark_needs_review` RPC exists yet.
- No `ignore_inbound` RPC exists yet.
- No transaction/RPC exists for other outcomes yet.

## Recommended Next Phase

Recommended next steps:

1. Either wire a very narrow internal UI action for `keep_existing` only.
2. Or first add read-only visibility of `staff_review_status` and `staff_review_outcome` in the inbound response detail/table.
3. Keep `accept_inbound_response` separate and later.
4. Keep every future outcome explicit and audited.

## What Not To Do Next

- Do not add `accept_inbound_response` in the same slice as the first UI action.
- Do not add update-reminder behavior to this RPC.
- Do not add bulk resolution.
- Do not send SMS replies.
- Do not update appointments.
- Do not bypass clinic membership checks.
