# Chairside Staff Review Resolution Design

This design document defines a future staff workflow for resolving inbound reminder response conflicts before any write actions are added to `/internal/inbound-responses`.

## Purpose

Chairside now surfaces inbound reminder responses that may need staff review, especially repeat or conflicting SMS responses.

This document defines explicit rules for a future resolution workflow so that any future write actions are deliberate, auditable, and constrained.

## Problem

Repeat or conflicting inbound responses are visible through `metadata.needs_staff_review`.

Current problem space:

- The inbound processor can record repeat conflicting responses as inbound messages.
- The repeat guard prevents automatic overwrite of `reminders.response_status`.
- `/internal/inbound-responses` can filter review-worthy rows.
- There is no staff workflow to resolve those rows yet.

Adding write buttons directly to the table without resolution rules could corrupt reminder state, erase useful audit context, or silently overwrite a patient's prior response.

## Current State

The Telnyx inbound reminder response processor currently:

- Records repeat conflicting responses as inbound `public.messages` rows.
- Does not overwrite `reminders.response_status` when a reminder already has a response.
- Marks conflicts using inbound message metadata.

Relevant metadata includes:

- `parsed_response`
- `repeat_response`
- `previous_response_status`
- `repeat_outcome`
- `needs_staff_review`
- `matched_outbound_message_id`
- `provider_event_id`

The `/internal/inbound-responses` page is currently:

- Read-only.
- Internal/debug-oriented.
- Able to filter rows with `Iba vyžaduje review`.
- Able to show conflict metadata and the `Vyžaduje review` badge.
- Not a staff resolution UI.

## Desired Staff Workflow

Future staff workflow should be explicit and one-row-at-a-time.

Proposed flow:

1. Staff opens a review row from `/internal/inbound-responses`.
2. Staff sees the context needed to understand the conflict.
3. Staff chooses one deliberate resolution outcome.
4. Chairside records the resolution as audit metadata.
5. Chairside updates the reminder only for outcomes that explicitly require it.

The review view should show:

- Current `reminders.response_status`.
- Inbound message `metadata.parsed_response`.
- Inbound message `metadata.previous_response_status`.
- Patient context.
- Reminder context.
- Appointment context.
- Full inbound message body.
- Existing repeat metadata.
- Timestamp and provider message id.

Staff should be able to choose one explicit resolution:

- Keep existing reminder response.
- Update reminder response to the inbound parsed response.
- Mark reminder response as `needs_review`.
- Ignore inbound message as irrelevant.

Every staff action must be deliberate and auditable.

## Proposed Resolution Outcomes

Initial proposed outcomes:

- `keep_existing`
- `accept_inbound_response`
- `mark_needs_review`
- `ignore_inbound`

Optional future outcome:

- `contact_patient`

Outcome meanings:

- `keep_existing`: Preserve current reminder response state and mark the inbound message as reviewed.
- `accept_inbound_response`: Update reminder response state to the inbound message's parsed response.
- `mark_needs_review`: Set or keep reminder response state as `needs_review`.
- `ignore_inbound`: Mark the inbound message as reviewed but irrelevant to reminder state.
- `contact_patient`: Future placeholder for cases where staff should manually follow up before changing state.

## Proposed Writes, Future Only

Future resolution should write only after a staff member selects an explicit action.

For `accept_inbound_response`:

- Update the matched reminder:
  - `response_status = inbound metadata.parsed_response`
  - `status = "responded"` if needed
  - `response_received_at` only if the product decision says staff resolution should replace the response timestamp

For `mark_needs_review`:

- Update the matched reminder:
  - `response_status = "needs_review"`
  - `status = "responded"` if needed

For `keep_existing` and `ignore_inbound`:

- Do not update the reminder.
- Record resolution metadata on the inbound message.

Future inbound message metadata should include:

- `staff_review_status`
- `staff_review_outcome`
- `staff_reviewed_at`
- `staff_reviewed_by`
- `staff_review_note`
- `staff_review_previous_response_status`
- `staff_review_new_response_status`, when changed

Future workflow may also write one `public.chairside_activity_log` row for the resolution action.

Future resolution must not:

- Update appointments.
- Send SMS replies.
- Call provider APIs.
- Process booking or rescheduling text.

## Audit Requirements

Every resolution should preserve original inbound message metadata.

Audit should record:

- Original `metadata.parsed_response`.
- Original `metadata.repeat_outcome`.
- Original `metadata.previous_response_status`.
- Previous reminder `response_status` before staff action.
- New reminder `response_status` if changed.
- Actor user id when available.
- Actor label or email when available.
- Review timestamp.
- Staff note when supplied.

Prefer a future RPC or transaction helper so that message metadata, reminder update, and activity log entry are committed consistently.

## Safety Rules

Safety rules for future implementation:

- No bulk resolve.
- No automatic overwrite.
- No appointment booking from review actions.
- No appointment rescheduling from review actions.
- No outbound SMS reply from resolution actions.
- No raw `provider_events.payload` exposure.
- Only clinic members can resolve rows for clinics they can access.
- Do not update multiple reminders from one review action.
- Do not infer intent from message text alone when resolving conflicts.

## Suggested UI Shape

Keep `/internal/inbound-responses` read-only for now.

Future UI should use a detail drawer or modal for one row at a time.

The detail view should show context before actions:

- Patient label and phone, when available.
- Appointment time and service, when available.
- Reminder id and current reminder response state.
- Inbound body and parsed response.
- Previous response status.
- Repeat outcome and review flag.
- Matched outbound message id.

Resolution actions should be visually separate from the table row.

For conflicting updates, require at least an optional staff note, and consider requiring a note when the action changes `confirmed` to `declined`, `declined` to `confirmed`, or any final response to `needs_review`.

The UI should warn if the reminder was already changed after the inbound message was received.

## Implementation Order Recommendation

Recommended implementation order:

1. Add a read-only row detail view or expandable row.
2. Design a DB/RPC transaction for resolution writes.
3. Implement one metadata-only action first:
   - `keep_existing`
4. Implement `accept_inbound_response` with a reminder update.
5. Add `mark_needs_review` and `ignore_inbound`.
6. Consider an activity log entry for each resolution.
7. Leave appointment actions out of this workflow.

This order keeps the first write slice small and auditable.

## Known Limitations

- There is no dedicated `staff_review` table yet.
- Metadata-only audit may be enough for prototype use but may not be enough for production.
- There is no staff review UI yet.
- There is no transaction/RPC wrapper yet.
- There is no notification workflow for unresolved conflicts yet.
- There is no explicit concurrency guard for reminder changes between message receipt and staff resolution yet.

## What Not To Do Next

- Do not add write buttons directly to table rows.
- Do not silently resolve conflicts.
- Do not send provider messages or SMS replies.
- Do not update appointments.
- Do not expose raw `provider_events` payload.
- Do not bulk-resolve conflicts.
- Do not overwrite reminder response state without recording previous and new values.
