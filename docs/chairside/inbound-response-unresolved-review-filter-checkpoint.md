# Chairside Inbound Response Unresolved Review Filter Checkpoint

This checkpoint summarizes the updated read-only review filtering behavior in `/internal/inbound-responses`.

## Purpose

The updated review filter distinguishes unresolved staff-review conflicts from already resolved historical conflicts.

It exists to:

- Focus `Iba vyžaduje review` on unresolved review items.
- Keep resolved conflict history visible in the default view.
- Avoid hiding staff review metadata that remains useful for audit/debugging.
- Keep the UI read-only.

## Current Behavior

Current route:

```text
/internal/inbound-responses
```

The `Iba vyžaduje review` toggle now means:

- `metadata.needs_staff_review === true`
- and `metadata.staff_review_status !== "resolved"`

Resolved review rows:

- Remain visible in the default view.
- Show as `Vyriešené review`.
- Continue to display `staff_review_status` and `staff_review_outcome` in the table.
- Continue to show full staff review metadata in the inline detail panel.

Count badges now include:

- `Načítané`: all loaded inbound reminder response rows.
- `Vyžaduje review`: unresolved review rows.
- `Vyriešené review`: rows where `needs_staff_review === true` and `staff_review_status === "resolved"`.
- `Zobrazené`: rows currently visible after the toggle state is applied.

## Local Validation

Local browser validation loaded:

```text
/internal/inbound-responses
```

Validation confirmed:

- Default view showed all rows.
- `Vyžaduje review = 0`.
- `Vyriešené review = 2`.
- Enabling `Iba vyžaduje review` showed `Zobrazené = 0`.
- Empty state displayed the unresolved-review message:
  - `Žiadne inbound odpovede vyžadujúce review...`
- Resolved `keep_existing` rows remained visible in the default view.
- The resolved `keep_existing` row `test-repeat-inbound-nie-1778850279` still opened inline detail.
- No write buttons existed.
- Browser console had no errors.

## Safety

This is a read-only UI filtering change.

It does not:

- Insert, update, or delete rows.
- Call `resolve_inbound_response_keep_existing`.
- Call any RPC from the UI.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Send SMS replies.
- Change Supabase schema.
- Change seed data.
- Change package files.

## Known Limitations

- No staff resolution button is wired yet.
- No `accept_inbound_response` outcome exists yet.
- Reviewed rows still keep `metadata.needs_staff_review = true`.
- The UI derives unresolved versus resolved review state from `metadata.staff_review_status`.
- There is no separate staff-review audit table yet.

## Recommended Next Phase

Recommended next steps:

1. Optionally wire a narrow `keep_existing` UI action now that resolved visibility is clear.
2. Keep `accept_inbound_response` separate and later.
3. Decide whether future `keep_existing` resolution should clear `needs_staff_review` or preserve it as a historical conflict marker.
