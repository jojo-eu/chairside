# Chairside Inbound Responses Read-Only Checkpoint

This checkpoint summarizes the current internal read-only debug UI for inbound reminder responses and repeat response conflicts.

## Purpose

The inbound responses debug page provides internal read-only visibility into inbound reminder responses stored in `public.messages`.

It exists to:

- Surface `parsed_response` metadata from inbound reminder messages.
- Surface repeat response metadata created by the Telnyx inbound reminder response processor.
- Help debug staff-review-worthy conflicts such as repeated conflicting responses.
- Keep conflict visibility separate from staff resolution workflow design.

This is not a staff workflow or resolution UI yet.

## Current Route

Current route:

```text
/internal/inbound-responses
```

Route behavior:

- Route-only internal/debug page.
- Registered in CRM custom routes.
- Not added to the main product navigation.
- Requires normal app authentication.

## Data Source

Primary table:

- `public.messages`

Current filters:

- `direction = "inbound"`
- `reminder_id is not null`
- `provider_message_id is not null`

Ordering:

- Newest first by `received_at`.
- Secondary ordering by `created_at`.

Access:

- Reads through the normal authenticated Supabase client.
- Respects existing RLS for the logged-in user.
- Does not use a service-role/admin client.

## Displayed Fields

The page displays:

- `provider`
- `provider_message_id`
- `body`
- `status`
- `received_at`
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
- Metadata preview

The metadata preview renders only the `messages.metadata` JSON for the inbound message. It does not render raw `provider_events.payload`.

## Repeat Conflict Visibility

Repeat response metadata is visible directly in the table.

Current repeat conflict behavior in the UI:

- `needs_staff_review = true` is highlighted and shown with a visible `Vyžaduje review` badge.
- `repeat_conflicting_response` is shown in the repeat outcome column.
- `repeat_same_response` is shown when present.
- `previous_response_status` is shown when present.
- Repeat response rows remain read-only.

The page does not resolve conflicts and does not mutate reminder response state.

## Safety

The page is read-only.

It does not:

- Insert, update, or delete rows.
- Update reminders.
- Update messages.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Send SMS replies.
- Display raw `provider_events` payloads.
- Expose provider secrets.

The visible internal note states that the page is read-only, staff review actions are not implemented, provider calls are not made, SMS is not sent, and raw provider event payloads are not displayed.

## Local Browser Validation

Local browser validation loaded:

```text
/internal/inbound-responses
```

Validation confirmed that local inbound test messages were visible, including:

- `test-inbound-tomas-response-001`
- `test-inbound-response-nie-001`
- `test-inbound-response-review-001`
- `test-inbound-repeat-guard-001`

The repeat conflict row showed:

- `repeat_response = "Áno"`
- `previous_response_status = "needs_review"`
- `repeat_outcome = "repeat_conflicting_response"`
- `needs_staff_review = "Vyžaduje review"`

The metadata preview rendered successfully.

Browser validation also confirmed:

- The route loaded successfully.
- The internal read-only note was visible.
- No browser console or page runtime errors were reported during the validation pass.

## Known Limitations

- No staff resolution actions exist yet.
- No filters or search controls exist yet.
- Patient and appointment names are not joined into this page yet.
- The current query is limited to the first 100 matching rows.
- There is no pagination beyond the current query limit.
- This remains an internal/debug route only.
- It is not a polished product feature.

## Recommended Next Phase

Recommended next steps:

1. Add filters for `needs_staff_review` and `parsed_response` if the debug page becomes noisy.
2. Add patient and appointment labels later if they help debugging.
3. Design a staff resolution workflow before adding any write actions.
4. Keep any future resolution workflow explicit and audited.

## What Not To Do Next

- Do not add write actions directly without staff workflow design.
- Do not expose raw provider payloads.
- Do not send automatic SMS replies from this page.
- Do not add this page to main navigation as a polished product feature yet.
