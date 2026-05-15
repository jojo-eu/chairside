# Chairside Inbound Response Detail Read-Only Checkpoint

This checkpoint summarizes the read-only per-row detail view on `/internal/inbound-responses`.

## Purpose

The inbound response detail view exposes per-row context for inbound reminder responses.

It exists to:

- Help staff investigate inbound response rows without leaving the table.
- Surface repeat/conflict metadata next to the selected row.
- Support staff-review investigation without introducing write actions.
- Keep `/internal/inbound-responses` read-only and debug-oriented.

This is not a staff resolution workflow.

## Current UI Behavior

Each inbound response row now has a detail control:

- `Zobraziť detail`
- `Skryť detail`

Behavior:

- Only one row is expanded at a time.
- Clicking `Zobraziť detail` opens the selected row detail.
- Clicking `Skryť detail` collapses the selected row detail.
- The detail renders inline directly below the selected table row.
- The detail uses a table row with one cell spanning the full table width.
- The detail is not a drawer or modal.
- The detail does not navigate away from the page.
- The `Iba vyžaduje review` filter remains working.
- The `Načítané`, `Vyžaduje review`, and `Zobrazené` counts remain working.

The detail includes the visible note:

```text
Staff resolution actions are not implemented yet.
```

## Detail Fields Shown

The inline detail view shows:

- `provider_message_id`
- `body`
- `metadata.parsed_response`
- `metadata.repeat_response`
- `metadata.previous_response_status`
- `metadata.repeat_outcome`
- `metadata.needs_staff_review`
- `metadata.matched_outbound_message_id`
- `reminder_id`
- `patient_id`
- `appointment_id`
- `clinic_id`
- Full `messages.metadata` JSON

The detail does not display raw `provider_events.payload`.

## Safety

The detail view is read-only.

It does not:

- Insert, update, or delete rows.
- Add accept, resolve, ignore, or update actions.
- Update reminders.
- Update messages.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Send SMS replies.
- Display raw `provider_events` payloads.
- Expose provider secrets.

This slice did not change:

- Supabase schema.
- Seed data.
- Package files.
- CRM route registration.

## Browser Validation

Local browser validation loaded:

```text
/internal/inbound-responses
```

Validation confirmed:

- The page loaded successfully.
- The table displayed inbound response rows.
- The review filter still worked.
- Clicking `Zobraziť detail` on `test-inbound-repeat-guard-001` expanded detail inline directly below the selected row.
- The clicked button changed to `Skryť detail`.
- The detail showed `repeat_conflicting_response`.
- The detail showed `needs_staff_review = true`.
- The detail showed the read-only warning.
- Full metadata JSON rendered.
- No accept, resolve, ignore, update, or save controls were present.
- No browser console or page runtime errors were reported during validation.

## Known Limitations

- There is still no staff resolution workflow.
- There are still no joined patient or appointment human-readable labels.
- There is no pagination beyond the current query limit.
- This remains an internal/debug surface only.
- The detail view is intentionally contextual, not a production staff task queue.

## Recommended Next Phase

Recommended next steps:

1. Design a transaction/RPC for future staff resolution before adding write actions.
2. Optionally add read-only patient and appointment labels.
3. Keep any future resolution actions explicit and audited.
4. Preserve the read-only detail view as the investigation surface until resolution rules are implemented.
