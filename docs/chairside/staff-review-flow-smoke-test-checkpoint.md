# Chairside Staff Review Flow Smoke Test Checkpoint

This checkpoint captures the current end-to-end state of inbound reminder response staff review.

## Purpose

This document records the current smoke-tested inbound staff review flow.

It exists to:

- Capture the implemented end-to-end state of inbound reminder response staff review.
- Document which pieces are implemented and validated.
- Keep the current safety boundaries explicit before adding more workflow behavior.

## Implemented Flow

The current flow is:

1. A Telnyx inbound reminder response is processed into an inbound `public.messages` row.
2. Repeat or conflicting inbound responses can be marked with `metadata.needs_staff_review = true`.
3. `/internal/inbound-responses` shows unresolved and resolved review state.
4. `keep_existing` resolves an unresolved review row without changing `reminders.response_status`.
5. `accept_inbound_response` resolves an unresolved review row and changes `reminders.response_status` to the inbound message `metadata.parsed_response`.
6. Both UI actions write only through RPC calls.

The UI does not write directly to `messages` or `reminders`.

## Safety Boundaries

The implemented staff review flow does not:

- Update appointments.
- Send SMS replies.
- Call Telnyx, Vapi, Telegram, OpenClaw, or any provider from the UI.
- Perform direct client writes.
- Provide bulk actions.
- Bypass server-side clinic membership checks.

Clinic membership is enforced server-side by the staff review RPCs through the `current_clinic_ids()` pattern.

## Validated Examples

### keep_existing UI Action

Validated provider message id:

```text
test-keep-existing-ui-message-001
```

Validated outcome:

- `staff_review_outcome = keep_existing`
- `reminder.response_status` remained `needs_review`

### accept_inbound_response UI Action

Validated provider message id:

```text
test-accept-inbound-rpc-success-001-1779099302
```

Validated outcome:

- `staff_review_outcome = accept_inbound_response`
- `reminder.response_status` changed from `needs_review` to `confirmed`

### RPC Validation Paths

The following paths have also been validated:

- `stale_reminder_state`
- `cancelled_reminder`
- `invalid_parsed_response`
- `already_resolved`

## Current Internal UI

Current route:

```text
/internal/inbound-responses
```

Current UI capabilities:

- Review filter: `Iba vyžaduje review`
- Counts for unresolved and resolved review rows
- Staff review action panel in inline detail
- Clear action cards:
  - `Bezpečná voľba`
  - `Mení stav pripomienky`

The action panel is shown only for unresolved review rows and is hidden for resolved or non-review rows.

## Known Limitations

- The page is internal/debug only.
- No staff note input exists yet.
- No activity log display exists yet.
- No confirmation modal exists yet.
- No appointment or rescheduling behavior exists.
- The wide table remains not-final product UX.

## Recommended Next Phase

Recommended next options:

1. Add an optional staff review note input.
2. Or add activity log/audit display.
3. Avoid appointment changes for now.
4. Keep voice, Telnyx, and Vapi work separate from this staff review flow.

## What Not To Do Next

- Do not add bulk resolution.
- Do not send patient replies.
- Do not add direct UI writes.
- Do not update appointments from this review screen.
- Do not bypass RPC stale-state guards.
