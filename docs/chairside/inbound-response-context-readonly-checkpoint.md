# Chairside Inbound Response Context Read-Only Checkpoint

This checkpoint summarizes the human-readable context added to the read-only inbound response detail view.

## Purpose

The human context in the inbound response detail makes staff-review investigation easier without introducing resolution actions.

It exists to:

- Make one inbound response row understandable without manually copying UUIDs.
- Show patient, appointment, and reminder context next to repeat/conflict metadata.
- Keep `/internal/inbound-responses` read-only and non-resolution.
- Prepare for a future explicit staff review workflow without adding writes now.

## Current UI Behavior

Current route:

```text
/internal/inbound-responses
```

The table behavior remains unchanged:

- It still lists inbound reminder-linked provider messages.
- It still supports the `Iba vyžaduje review` filter.
- It still shows the `Načítané`, `Vyžaduje review`, and `Zobrazené` counts.
- It still expands detail inline directly below the selected row.
- Only one row is expanded at a time.

The inline detail now shows both:

- UUID/debug fields.
- Human-readable patient, appointment, and reminder context when available.

The detail remains a read-only investigation surface. It is not a staff resolution workflow.

## Context Source

Context is fetched through the normal authenticated Supabase client and existing RLS.

No service-role/admin client is used.

The context is read from:

- `public.patients`
- `public.appointments`
- `public.reminders`

The lookup runs only for the selected detail row.

If one of the related read-only lookups fails, the detail shows a non-blocking context warning and keeps the table/detail usable.

## Context Fields Shown

New human-readable context fields:

- `patient name`
- `patient phone`
- `appointments.starts_at`
- `reminder status`
- `reminder response_status`
- `reminder response_received_at`

Existing detail fields remain visible:

- `provider_message_id`
- `body/text`
- `parsed_response`
- `repeat_response`
- `previous_response_status`
- `repeat_outcome`
- `needs_staff_review`
- `matched_outbound_message_id`
- `reminder_id`
- `patient_id`
- `appointment_id`
- `clinic_id`
- Full `messages.metadata` JSON

If `appointments.starts_at` is unavailable or null, the detail renders `-`.

If `reminders.response_received_at` is unavailable or null, the detail renders `-`.

The detail does not display raw `provider_events.payload`.

## Safety

The page remains read-only.

It does not:

- Insert, update, or delete rows.
- Add accept, resolve, ignore, or update buttons.
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
- Detail for `test-inbound-repeat-guard-001` opened inline.
- The detail showed patient name `Tomáš Svoboda`.
- The detail showed patient phone `+420606777888`.
- The detail showed `appointments.starts_at`.
- The detail showed reminder `status = responded`.
- The detail showed reminder `response_status = needs_review`.
- The detail showed `reminder response_received_at`.
- The detail showed `repeat_conflicting_response`.
- The detail showed `needs_staff_review = true`.
- No browser console or page runtime errors were reported during validation.

## Known Limitations

- There is no staff resolution workflow yet.
- There is no transaction/RPC for future staff resolution yet.
- Context fetch is a simple client-side read-only lookup.
- There are no pagination improvements in this slice.
- There are no search/filter improvements in this slice.
- This remains an internal/debug route only.

## Recommended Next Phase

Recommended next steps:

1. Design a transaction/RPC for future staff resolution before adding write actions.
2. Optionally add read-only search or filtering by patient.
3. Optionally add more read-only review-status filtering.
4. Keep any staff resolution explicit and audited.
