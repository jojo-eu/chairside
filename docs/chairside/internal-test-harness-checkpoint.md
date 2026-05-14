# Chairside Internal Test Harness Checkpoint

This checkpoint documents the current internal booking/reminder test harness state.

## Purpose

The internal test harness is a local/dev-oriented page for manually exercising the current Chairside booking and reminder Edge Function chain from inside the authenticated app shell.

It exists to validate the MVP operational loop before provider delivery work is connected:

```text
availability -> booking -> pending reminder -> outbound marker -> inbound response -> reminder status
```

This is not a public booking page, not a patient-facing experience, and not production UX. It is a thin internal harness around the current Supabase Edge Functions and local authenticated clinic access.

## Route

Application route:

```text
/internal/booking-test
```

In the current local React Admin hash-router build, the browser URL appears as:

```text
/#/internal/booking-test
```

The route is intentionally not linked from the main Chairside navigation.

## What The Harness Tests

The harness currently supports the following manual flow:

1. Load visible clinics, patients, and services through the existing Supabase client and local auth/RLS.
2. Select a clinic.
3. Select a patient.
4. Select an active service.
5. Enter or select an appointment start time.
6. Call `check-availability`.
7. Call `book-appointment`.
8. Display the created appointment id.
9. Query and display the pending reminder created by `book-appointment`.
10. Call `mark-reminder-sent`.
11. Confirm an outbound `messages` row is created by the function response.
12. Call `receive-reminder-response` with a simple text body, defaulting to `ÁNO`.
13. Confirm an inbound `messages` row is created by the function response.
14. Confirm the reminder reaches `responded / confirmed` for `ÁNO`.

The harness calls the current functions through `supabase.functions.invoke`:

- `check-availability`
- `book-appointment`
- `mark-reminder-sent`
- `receive-reminder-response`

It also reads the created reminder from `public.reminders` after booking so the reminder state-transition steps can continue.

## Current Validation Result

Local browser validation confirmed:

- `check-availability` returned HTTP `200`.
- `book-appointment` returned HTTP `201`.
- The created appointment id was shown in the harness.
- The created reminder id was shown in the harness.
- The `mark-reminder-sent` step worked.
- The `mark-reminder-sent` response showed an outbound message row.
- The `receive-reminder-response` step worked with body `ÁNO`.
- The `receive-reminder-response` response showed an inbound message row.
- The final reminder state shown by the harness was `responded / confirmed`.
- The browser console had no runtime errors during the tested flow.
- Only non-blocking form-label/accessibility warnings were visible.

Example local validation result from the browser run:

```json
{
  "route": "http://localhost:5175/#/internal/booking-test",
  "availability_slot_count": 28,
  "booking_status": "scheduled",
  "mark_sent_message_direction": "outbound",
  "response_body": "ÁNO",
  "response_parsed": "confirmed",
  "response_message_direction": "inbound",
  "final_reminder_state": "responded / confirmed"
}
```

Validation used local fake/test data and a local authenticated test user only. No production or remote Supabase project was touched.

## Important Constraints

- Internal/dev tool only.
- Not patient-facing.
- Not linked from main patient/clinic navigation.
- Does not send real SMS.
- Does not call Telnyx, Vapi, Telegram, or OpenClaw.
- Uses current Supabase Edge Functions.
- Uses the existing local Supabase auth/session pattern.
- Uses tenant access provided by current RLS and local clinic membership.
- Does not bypass the Edge Function write boundary for booking or reminder state transitions.

## Known Limitations

- Simple UI.
- No production UX.
- No idempotency.
- No real provider delivery.
- No Telnyx webhook.
- No webhook signature verification.
- No appointment status update from patient response.
- No automatic scheduler/cron flow.
- Some form labels/accessibility warnings remain.
- The harness displays raw JSON responses for test visibility.
- The harness assumes an authenticated local/internal user with access to seeded clinic data.

## Recommended Next Phase

Next, decide between:

- cleaning up the remaining internal harness accessibility warnings, or
- starting the first provider-integration skeleton.

Recommended sequence:

1. Finish this documentation checkpoint.
2. Keep the internal harness available for local verification.
3. Add a provider-integration skeleton only after provider boundaries are explicit.

The useful next integration slice is a narrow send-reminder/provider boundary skeleton that still avoids real delivery until request validation, idempotency strategy, provider event capture, and failure behavior are clear.

## What Not To Do Next

- Do not expose this route as a public booking UI.
- Do not add it to the main patient/clinic navigation.
- Do not connect real SMS before provider boundaries are explicit.
- Do not call Telnyx, Vapi, Telegram, or OpenClaw from React.
- Do not turn this into a generic workflow engine UI.
- Do not bypass the database overlap constraint or Edge Function write boundary.
- Do not expose service-role credentials to frontend code.
