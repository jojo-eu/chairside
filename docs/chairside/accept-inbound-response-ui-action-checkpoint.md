# Chairside Accept Inbound Response UI Action Checkpoint

This checkpoint summarizes the implemented `accept_inbound_response` staff review UI action in `/internal/inbound-responses`.

## Purpose

`accept_inbound_response` is the second staff review UI action.

It exists to:

- Let staff accept the parsed inbound SMS response as the reminder `response_status`.
- Use the existing `resolve_inbound_response_accept_inbound` RPC.
- Keep the action separate from `keep_existing`.
- Avoid direct reminder writes from the React client.
- Avoid appointment, provider, and SMS side effects.

## UI Behavior

Button label:

```text
Prijať odpoveď zo SMS
```

The button is shown only for unresolved review rows:

- `metadata.needs_staff_review === true`
- `metadata.staff_review_status !== "resolved"`

The button is shown next to:

```text
Ponechať existujúci stav
```

The detail panel includes warning copy explaining that `Prijať odpoveď zo SMS` changes `reminder.response_status` to the inbound `parsed_response`.

The accept button is disabled unless:

- `parsed_response` is one of:
  - `confirmed`
  - `declined`
  - `needs_review`
- Reminder context is loaded and includes the current `reminder.response_status`.

The accept button is hidden for:

- Already resolved review rows.
- Non-review rows.

## Write Path

The only write path is the Supabase RPC:

```text
resolve_inbound_response_accept_inbound
```

The UI does not:

- Directly call `.update()` on `public.messages`.
- Directly call `.insert()` on `public.messages`.
- Directly call `.delete()` on `public.messages`.
- Directly update `public.reminders`.
- Call provider APIs.
- Send SMS.
- Update appointments.

## RPC Inputs From UI

The UI passes:

- `p_inbound_message_id = message.id`
- `p_expected_current_reminder_response_status = loaded detail reminder.response_status`
- `p_staff_review_note = null`

There is no staff note input in the current slice.

## Return Handling

The UI handles RPC return statuses as follows:

- `resolved`: show success message.
- `already_resolved`: show info message and refresh.
- `stale_reminder_state`: show warning and refresh.
- `invalid_parsed_response`: show warning.
- `cancelled_reminder`: show warning.
- `not_found`: show error.
- Unexpected status: show warning.

Success message:

```text
Odpoveď zo SMS bola prijatá a stav pripomienky bol aktualizovaný.
```

## Local Validation

Local browser validation used an unresolved review row:

```text
message_id = 36447caa-f09b-40a3-8752-6c8ad8f96e41
provider_message_id = test-accept-inbound-rpc-success-001-1779099302
parsed_response = confirmed
```

Initial reminder state:

- `response_status = needs_review`

Validation flow:

- Opened `/internal/inbound-responses`.
- Opened inline detail for the unresolved review row.
- Confirmed both buttons were visible:
  - `Ponechať existujúci stav`
  - `Prijať odpoveď zo SMS`
- Confirmed warning copy was visible.
- Clicked `Prijať odpoveď zo SMS`.
- Confirmed the UI success message.

Resulting metadata became:

- `staff_review_status = resolved`
- `staff_review_outcome = accept_inbound_response`
- `staff_reviewed_by` was set.
- `previous_reminder_response_status = needs_review`
- `new_reminder_response_status = confirmed`

Validated reminder:

```text
c31d170d-6241-4cd5-b13d-d07f0aa30cbb
```

Reminder result:

- `status = responded`
- `response_status = confirmed`

UI result:

- Row left `Iba vyžaduje review`.
- Row remained visible in the default view as `Vyriešené review`.
- Browser console had no errors.

Additional note:

- A cancelled reminder row correctly showed the cancelled warning when tested accidentally.

## Safety

Safety boundaries:

- No `keep_existing` regression was observed.
- No direct writes from the UI.
- No appointment updates.
- No provider calls.
- No SMS replies.
- No bulk actions.
- No schema changes.
- No seed changes.
- No package changes.

The only intentional write is through the existing RPC.

## Known Limitations

- `p_staff_review_note` remains `null`.
- No staff note input exists yet.
- No activity log display exists yet.
- The UI remains internal/debug-oriented.
- The wide table/action area can be easy to miss.
- No appointment or rescheduling logic exists, by design.

## Recommended Next Phase

Recommended next steps:

1. Add an optional staff note input shared by both staff review actions.
2. Or add activity log write/display before expanding review actions.
3. Keep appointment and rescheduling behavior out of this workflow.

## What Not To Do Next

- Do not combine this action with appointment updates.
- Do not send patient replies.
- Do not add bulk accept.
- Do not bypass the stale-state expected `response_status` guard.
- Do not update reminders directly from the client.
