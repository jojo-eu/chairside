# Chairside Staff Review Action Panel UX Checkpoint

This checkpoint records the staff review action panel UX polish in `/internal/inbound-responses`.

## Purpose

The staff review action panel was polished to make safety-sensitive actions easier to see and safer to use.

It exists to:

- Make staff review actions more visible inside the wide inbound responses table/detail layout.
- Reduce confusion between actions that preserve reminder state and actions that intentionally change reminder state.
- Clearly separate `keep_existing` from `accept_inbound_response`.
- Keep the action surface explicit while the page remains internal/debug-oriented.

## UI Behavior

The action panel appears only for unresolved review rows:

- `metadata.needs_staff_review === true`
- `metadata.staff_review_status !== "resolved"`

Resolved review rows and non-review rows do not show the action panel.

The panel has two stacked full-width action cards:

- `Bezpečná voľba` / `Ponechať existujúci stav`
- `Mení stav pripomienky` / `Prijať odpoveď zo SMS`

The cards are stacked vertically to avoid horizontal clipping in the current table/detail layout.

The `Mení stav pripomienky` card uses warning styling and shows:

- Current `reminder.response_status`
- `parsed_response target`

The current status and target boxes are also stacked vertically, with wrapping enabled so values remain visible without horizontal scrolling.

The action buttons remain unchanged:

- `Ponechať existujúci stav`
- `Prijať odpoveď zo SMS`

## Safety

This was a UX-only polish pass.

It did not change:

- RPC behavior.
- Existing handlers.
- Disabled conditions.
- Staff review return handling.
- Reminder update behavior.

It did not add:

- New writes.
- Direct `.update()`, `.insert()`, or `.delete()` calls from the UI.
- Provider calls.
- SMS sends.
- Appointment changes.
- Schema changes.
- Seed changes.
- Package changes.

## Local Browser Validation

Local browser validation opened:

```text
/internal/inbound-responses
```

Validation flow:

- Opened an unresolved review row.
- Confirmed the full action panel was visible without horizontal clipping.
- Confirmed both action cards were stacked full width.
- Confirmed both action buttons were visible:
  - `Ponechať existujúci stav`
  - `Prijať odpoveď zo SMS`
- Confirmed current `reminder.response_status` was visible.
- Confirmed `parsed_response target` was visible.
- Confirmed the browser console had no errors.

Validation also confirmed resolved review rows do not show the action panel.

## Known Limitations

- The page is still an internal/debug table.
- The wide inbound responses table remains generally hard to scan.
- No confirmation modal exists yet.
- No staff note input exists yet.
- No activity log/audit display is surfaced in the UI yet.

## Recommended Next Phase

Recommended next options:

1. Add an optional staff review note input.
2. Or add activity log/audit display before expanding workflow actions.
3. Keep rescheduling and appointment changes out of this flow.

## What Not To Do Next

- Do not add bulk review actions.
- Do not send patient replies from this screen.
- Do not update appointments from this screen.
- Do not bypass RPC stale-state guards.
- Do not add direct reminder or message writes from the React client.
