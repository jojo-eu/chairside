# Chairside Keep Existing Review UI Action Checkpoint

This checkpoint summarizes the first narrow staff review UI write action in `/internal/inbound-responses`.

## Purpose

The `keep_existing` UI action is the first narrow staff review write path.

It exists to:

- Resolve one unresolved review row by keeping the existing reminder `response_status`.
- Use the existing `resolve_inbound_response_keep_existing` RPC.
- Record resolution metadata on the inbound message through the RPC.
- Avoid direct reminder updates from the client.
- Avoid implementing `accept_inbound_response` or any update-reminder action in this slice.

## UI Behavior

Button label:

```text
Ponechať existujúci stav
```

The button is shown only in the inline detail panel for unresolved review rows:

- `metadata.needs_staff_review === true`
- `metadata.staff_review_status !== "resolved"`

The button is hidden for:

- Resolved review rows.
- Non-review rows.

After a successful `resolved` response:

- The messages list refreshes.
- The row becomes `Vyriešené review`.
- The row leaves the `Iba vyžaduje review` filter.
- The default view still shows the row as resolved review history.
- A small success message is shown on the page.

The `Iba vyžaduje review` toggle does not auto-switch off when the unresolved count reaches zero. This keeps the filter state explicit and predictable.

## Write Path

The only write path is the Supabase RPC:

```text
resolve_inbound_response_keep_existing
```

The UI does not:

- Directly update `public.messages`.
- Directly insert into `public.messages`.
- Directly delete from `public.messages`.
- Directly update `public.reminders`.
- Call provider APIs.
- Send SMS.

## RPC Inputs From UI

The UI passes:

- `p_inbound_message_id = message.id`
- `p_expected_current_reminder_response_status = detailContext.reminder.response_status`
- `p_staff_review_note = null`

There is no staff note input in the current slice.

## Return Handling

The UI handles RPC return statuses as follows:

- `resolved`: show success message and refresh messages.
- `already_resolved`: show info message and refresh messages.
- `stale_reminder_state`: show warning message and refresh messages.
- `not_found`: show error message.
- Unexpected status: show warning message.

## Local Validation

Local browser validation used a fake unresolved repeat conflict row:

```text
test-keep-existing-ui-message-001
```

Validation flow:

- Opened `/internal/inbound-responses`.
- Opened the row's inline detail.
- Confirmed the `Ponechať existujúci stav` button was visible.
- Clicked `Ponechať existujúci stav`.
- Confirmed the RPC returned success.

Resulting metadata became:

- `staff_review_status = "resolved"`
- `staff_review_outcome = "keep_existing"`
- `staff_reviewed_by` was set.
- `previous_reminder_response_status = "needs_review"`
- `new_reminder_response_status = "needs_review"`

Validated reminder:

```text
50023896-11f6-47ba-97ab-27292aca9044
```

Reminder state stayed:

- `status = "responded"`
- `response_status = "needs_review"`

UI validation confirmed:

- The row disappeared from the unresolved review filter.
- The row remained visible in the default view as `Vyriešené review`.
- No accept, update, ignore, or provider action buttons existed.
- Browser console had no errors.

## Safety

This slice does not implement:

- `accept_inbound_response`.
- Direct reminder updates from the UI.
- Appointment updates.
- Provider calls.
- SMS replies.
- Bulk actions.
- Schema changes.
- Seed data changes.
- Package changes.

The only intentional write is the existing RPC call.

## Known Limitations

- No staff note input exists yet.
- No `accept_inbound_response` outcome exists yet.
- No update-reminder staff action exists yet.
- No activity log display exists yet.
- The UI is still internal/debug-oriented.
- The wide table can make the action easy to miss; a future layout may need a clearer review-focused detail surface.

## Recommended Next Phase

Recommended next options:

1. Add a small staff note input for `keep_existing`.
2. Or design and implement `accept_inbound_response` as a separate RPC.
3. Keep any accept/update reminder action separate, explicit, and audited.
