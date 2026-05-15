# Chairside Inbound Responses Review Filter Checkpoint

This checkpoint summarizes the read-only review filter added to the internal inbound responses debug page.

## Purpose

The review filter makes staff-review-worthy inbound response conflicts easier to find.

It exists to:

- Surface inbound reminder responses where `metadata.needs_staff_review = true`.
- Help debug repeat conflicts without scanning every inbound response row.
- Keep the page internal, read-only, and debug-oriented.

This is not a staff resolution workflow.

## Current UI Behavior

Current route:

```text
/internal/inbound-responses
```

The page now includes a toggle labeled:

```text
Iba vyžaduje review
```

Behavior:

- Default off shows all loaded inbound reminder responses.
- Enabled shows only rows where `metadata.needs_staff_review === true`.
- Filtering is immediate and client-side.
- The existing read-only/debug note remains visible.
- No staff resolution actions are available.

The page also shows count badges:

- `Načítané`: total loaded rows from the existing query.
- `Vyžaduje review`: loaded rows where `metadata.needs_staff_review === true`.
- `Zobrazené`: rows currently visible after the toggle state is applied.

## Data Behavior

The filter runs after the existing RLS-scoped `public.messages` query.

Existing query scope remains:

- `direction = "inbound"`
- `reminder_id is not null`
- `provider_message_id is not null`
- ordered newest first by `received_at` / `created_at`

This slice did not add:

- New database queries.
- Inserts, updates, or deletes.
- Schema changes.
- Seed changes.
- Package changes.

## Browser Validation

Local browser validation loaded:

```text
/internal/inbound-responses
```

Validation results:

- Default state showed `11` loaded rows.
- Review count showed `2`.
- Default visible count showed `11`.
- After enabling `Iba vyžaduje review`, visible count was `2`.

The review conflict rows included:

- `test-inbound-repeat-guard-001`
- `test-repeat-inbound-nie-1778850279`

Validation also confirmed:

- The `Vyžaduje review` badge remained visible.
- Repeat conflict metadata remained visible.
- No write actions were added.
- No browser console or page runtime errors were reported during validation.

## Safety

The page remains read-only.

It does not:

- Insert, update, or delete rows.
- Add staff resolution actions.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Send outbound replies.
- Display raw `provider_events` payloads.
- Expose provider secrets.

## Known Limitations

- There is no search/filter by patient yet.
- There is no search/filter by reminder yet.
- There is no staff resolution workflow.
- The page still does not join patient or appointment display names.
- There is no pagination beyond the current query limit.
- This remains an internal route only.

## Recommended Next Phase

Recommended next steps:

1. Design an explicit staff review resolution workflow before adding write actions.
2. Optionally add read-only search or a `parsed_response` filter.
3. Consider patient and appointment display labels later.
4. Keep any future resolution workflow explicit and audited.
