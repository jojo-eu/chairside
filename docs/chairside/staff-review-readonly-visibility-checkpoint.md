# Chairside Staff Review Read-Only Visibility Checkpoint

This checkpoint summarizes the read-only staff review metadata visibility added to `/internal/inbound-responses`.

## Purpose

The inbound responses debug view now surfaces staff review resolution metadata created by the `keep_existing` RPC.

It exists to:

- Make resolved/reviewed conflict state visible after `resolve_inbound_response_keep_existing`.
- Show staff review metadata without adding write controls.
- Keep `/internal/inbound-responses` read-only.
- Preserve the current split between visibility and future resolution actions.

## Current UI Behavior

Current route:

```text
/internal/inbound-responses
```

The table now shows lightweight staff review columns:

- `staff_review_status`
- `staff_review_outcome`

The inline detail view shows:

- `staff_review_status`
- `staff_review_outcome`
- `staff_reviewed_at`
- `staff_reviewed_by`
- `staff_review_note`
- `previous_reminder_response_status`
- `new_reminder_response_status`

Existing behavior remains in place:

- `Iba vyžaduje review` filter still works.
- `Načítané`, `Vyžaduje review`, and `Zobrazené` counts still work.
- Detail still expands inline below the selected row.
- Only one row is expanded at a time.
- No resolve, accept, ignore, or update buttons exist.

## Data Source

The staff review fields are read from:

- `public.messages.metadata`

The UI uses:

- Normal authenticated Supabase client access.
- Existing RLS.
- Read-only queries.

It does not:

- Perform any new DB writes.
- Call `resolve_inbound_response_keep_existing`.
- Use a service-role/admin client.
- Read raw `provider_events.payload`.

## Browser Validation

Local browser validation opened the detail for provider message id:

```text
test-repeat-inbound-nie-1778850279
```

Validation confirmed:

- `staff_review_status = resolved`
- `staff_review_outcome = keep_existing`
- `staff_reviewed_by` was visible.
- `staff_review_note` was visible when present in metadata.
- `previous_reminder_response_status = confirmed`
- `new_reminder_response_status = confirmed`
- The related reminder `response_status` remained `confirmed`.
- The `Iba vyžaduje review` filter still worked.
- No resolve, accept, ignore, or update buttons existed.
- Browser console had no errors.

## Safety

This is a read-only visibility slice.

It does not:

- Insert, update, or delete rows.
- Call `resolve_inbound_response_keep_existing`.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Send SMS replies.
- Update reminders.
- Update appointments.
- Change schema.
- Change seed data.
- Change package files.

## Known Limitations

- The UI can show resolved metadata but cannot perform resolution yet.
- Resolved conflicts may still appear in `Iba vyžaduje review` because `metadata.needs_staff_review` remains `true`.
- There is no separate unresolved-only filter yet.
- There is no staff-review-specific audit table yet.
- There is no `accept_inbound_response` UI or RPC yet.

## Recommended Next Phase

Recommended next options:

1. Add a read-only filter for unresolved review rows.
2. Or wire a very narrow `keep_existing` action using the existing RPC.
3. Keep `accept_inbound_response` separate and later.
4. Decide whether `keep_existing` should clear `needs_staff_review` or leave it as a historical conflict marker.

## What Not To Do Next

- Do not add an accept/update reminder action in the same slice.
- Do not send SMS replies.
- Do not update appointments.
- Do not bypass clinic membership or RLS.
- Do not hide historical conflict metadata without a clear model.
