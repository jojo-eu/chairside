# Chairside Provider Events Checkpoint

This checkpoint summarizes the current Chairside `provider_events` foundation.

## Purpose

`public.provider_events` is the safe storage layer for future external provider webhook events. It is intended to support future Telnyx and Vapi ingestion without processing provider payloads directly on receipt.

The table gives Chairside a durable place to store raw provider event envelopes before later processing logic maps them to `messages`, `reminders`, `call_logs`, or appointments. It also provides a deduplication boundary so repeated webhook deliveries can be detected before any downstream business action runs.

Current scope:

- Store future provider webhook events safely.
- Support future Telnyx and Vapi ingestion.
- Support deduplication before processing.
- Keep provider event capture separate from message/reminder/call processing.

## Current Database State

`public.provider_events` exists.

Columns include:

- `id`
- `clinic_id`
- `provider`
- `provider_event_id`
- `event_type`
- `resource_type`
- `resource_id`
- `received_at`
- `processed_at`
- `processing_status`
- `payload`
- `error_message`
- `created_at`

`clinic_id` is nullable because some webhook events may arrive before Chairside can safely map them to a clinic. This supports storing raw events first, then mapping later after signature verification and provider-specific lookup rules exist.

Allowed `provider` values:

- `telnyx`
- `vapi`
- `system`
- `manual`

Allowed `processing_status` values:

- `received`
- `processed`
- `ignored`
- `failed`

Deduplication:

- `unique(provider, provider_event_id)`

Indexes:

- `(clinic_id, received_at desc)` for clinic-scoped debug/review by time.
- `(provider, provider_event_id)` through the unique deduplication index.
- `(processing_status, received_at)` for future processing queues/debugging.
- `event_type` for event-type filtering.

Foreign key:

- `clinic_id` references `public.clinics(id)` with `on delete set null`.

RLS:

- RLS is enabled.
- Authenticated clinic users can select only rows where `clinic_id in current_clinic_ids()`.
- `clinic_id = null` rows are not visible to regular clinic users.
- Unmapped provider events require a future admin/service-role review surface or processing path.

## Current Seed Coverage

Local seed data includes fake provider events only:

- Fake Telnyx `message.sent`.
- Fake Telnyx `message.received`.
- Fake Telnyx `message.failed`.
- Fake Vapi `call.started`.
- Fake Vapi `call.ended`.
- Fake unmapped provider event with `clinic_id = null`.

All payloads are small, fake, local test JSON objects. They do not use real Telnyx/Vapi payloads, real provider IDs, or real patient/provider data.

Repeatability strategy:

- Seeded provider event ids use the `test-provider-event-*` prefix.
- The seed deletes existing events for the seeded clinic and events matching `test-provider-event-%` before inserting the fake rows.
- This avoids collisions with `unique(provider, provider_event_id)` when the local seed is reapplied.

## Current Internal Debug UI

Current route:

```text
/internal/provider-events
```

In the local React Admin hash-router build, this appears as:

```text
/#/internal/provider-events
```

The route is an internal/debug view only:

- Route-only page.
- Not linked from the main Chairside navigation.
- Read-only.
- Uses `public.provider_events`.
- Shows newest events first.

Displayed fields:

- `provider`
- `provider_event_id`
- `event_type`
- `resource_type`
- `resource_id`
- `processing_status`
- `received_at`
- `processed_at`
- `clinic_id`, or `unmapped` if null
- payload preview

The debug UI does not:

- Process provider events.
- Implement webhook ingestion.
- Call Telnyx, Vapi, Telegram, or OpenClaw.
- Send SMS.
- Expose service-role credentials or provider secrets.

## Local Validation Result

Local validation confirmed:

- `provider_events` seed rows exist in the local database.
- Clinic-mapped Telnyx/Vapi rows are visible in `/internal/provider-events` for a user with `clinic_members` access to the seeded clinic.
- The fake unmapped `clinic_id = null` provider event is hidden from a regular clinic user by RLS.
- Payload previews render in the debug UI.
- No real provider calls were made.
- No SMS was sent.

Observed browser validation:

- Five clinic-mapped fake provider events rendered for the clinic user.
- The unmapped fake event did not render for that user, which matches the RLS policy.
- Browser console/network validation showed no runtime errors or failed requests during the tested debug page load.

## Known Limitations

- No webhook ingestion yet.
- No webhook signature verification yet.
- No processing logic yet.
- No idempotency table yet.
- No provider event detail page yet.
- No admin-only view for unmapped events yet.
- No Telnyx/Vapi real payload mapping yet.
- No retry, queue, or dead-letter behavior yet.
- No provider event linkage to `messages`, `reminders`, or `call_logs` beyond fake resource id text in seed data.

## Recommended Next Phase

Recommended next sequence:

1. Add a Telnyx webhook skeleton that only validates the request boundary and stores raw events in `public.provider_events`.
2. Add webhook signature verification before trusting any provider payload fields.
3. Add a Vapi webhook skeleton using the same raw event storage pattern.
4. Define the idempotency/provider processing strategy before creating downstream message/reminder/call mutations from provider events.
5. Add a provider event detail/debug page only if the list view becomes insufficient for local debugging.

The next useful implementation slice is a narrow Telnyx raw-event capture endpoint. It should stop after storing provider events and should not send SMS or mutate reminder/message state.

## What Not To Do Next

- Do not send real SMS yet.
- Do not process patient responses directly from a provider webhook yet.
- Do not implement full Telnyx/Vapi production integration before event storage and signature boundaries are clear.
- Do not expose service-role credentials or provider secrets to frontend code.
- Do not turn the provider events debug page into public UI.
- Do not add the debug page to the main clinic navigation.
- Do not bypass RLS for normal clinic users to show unmapped provider events.
- Do not turn provider events into a generic workflow or campaign automation system.
