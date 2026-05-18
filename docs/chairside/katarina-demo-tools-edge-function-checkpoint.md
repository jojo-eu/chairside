# Chairside Katarína Demo Tools Edge Function Checkpoint

This checkpoint summarizes the implemented demo-safe Katarína voice demo tools Edge Function.

## Purpose

`katarina-demo-tools` is the first demo-safe runtime tool handler for the Katarína voice demo.

It exists to:

- Support a future Vapi-style tool-calling flow for the 60-90 second Katarína demo.
- Provide one narrow local/demo-safe runtime boundary.
- Keep the voice demo separate from staff review flow.
- Avoid production scheduling complexity in the first runtime slice.

This function is not a production scheduling or provider integration endpoint.

## Function Route

Function file:

```text
supabase/functions/katarina-demo-tools/index.ts
```

Local route:

```text
/functions/v1/katarina-demo-tools
```

Request shape:

```json
{
  "tool": "lookup_patient_by_phone",
  "arguments": {
    "phone": "+420606777888"
  }
}
```

Only `POST` JSON requests are accepted for tool calls. `OPTIONS` is supported for CORS preflight.

## Implemented Tools

Implemented tool names:

- `lookup_patient_by_phone`
- `list_available_slots`
- `create_demo_appointment`
- `record_reminder_response`

These names match the Katarína demo tool contract and are intended to be stable enough for a first Vapi tool-call configuration.

## Tool Behavior

### lookup_patient_by_phone

Behavior:

- Requires `arguments.phone`.
- Trims the phone string.
- Creates a user-scoped Supabase client with the caller's `Authorization` header.
- Queries `public.patients` through normal RLS.
- Returns a patient object with:
  - `id`
  - `first_name`
  - `last_name`
  - `phone`
- Returns `patient_not_found` when no visible patient matches.

This tool is read-only.

### list_available_slots

Behavior:

- Returns deterministic demo slots.
- Does not query production scheduling logic.
- Does not write to the database.
- Includes metadata:
  - `demo_mode = true`
  - `source = deterministic_demo_slots`

This tool is intentionally demo-safe and predictable for the short voice script.

### create_demo_appointment

Behavior:

- Requires:
  - `patient_id`
  - `slot_start`
  - `confirmed_by_patient = true`
- Returns `confirmation_required` unless the patient confirmation flag is true.
- Simulates an appointment only.
- Returns an appointment id with a `demo-` prefix.
- Returns metadata:
  - `source = simulated_demo_appointment`
  - `writes_database = false`
  - `sends_sms = false`

This tool does not insert an appointment row in this slice.

### record_reminder_response

Behavior:

- Requires:
  - `reminder_id`
  - `response_status`
- Allows response statuses:
  - `confirmed`
  - `declined`
  - `needs_review`
- Simulates reminder response recording only.
- Returns metadata:
  - `source = simulated_demo_reminder_response`
  - `writes_database = false`
  - `sends_sms = false`
  - `staff_review_rpc_used = false`

This tool does not call or reuse staff review RPCs in this slice.

## Security And Safety

Security and safety boundaries:

- Uses the existing `AuthMiddleware`.
- Requires authenticated requests.
- Uses no service role client.
- Makes no provider calls.
- Sends no SMS.
- Uses no external `fetch`.
- Does not expose raw provider payloads.
- Does not insert appointments.
- Does not mutate staff review state.
- Does not change schema, migrations, seed data, or packages.

The function is intended for local/demo tool handling only.

## Local Validation Results

Local validation used the Supabase Edge Function runtime and fake/demo inputs.

Confirmed:

- `OPTIONS` returned HTTP `204`.
- Unsupported tool returned HTTP `400` with `error = unsupported_tool`.
- `lookup_patient_by_phone` with `+420606777888` returned:
  - `ok = true`
  - Patient `Tomáš Svoboda`
- `list_available_slots` returned HTTP `200` with three deterministic slots:
  - `streda 10:30`
  - `štvrtok 14:00`
  - `piatok 09:15`
- `create_demo_appointment` without `confirmed_by_patient` returned HTTP `400` with `error = confirmation_required`.
- `create_demo_appointment` with `confirmed_by_patient = true` returned HTTP `200` with a simulated appointment:
  - `ok = true`
  - `demo_mode = true`
  - Appointment id prefixed with `demo-`
  - `metadata.writes_database = false`
  - `metadata.sends_sms = false`

`record_reminder_response` is implemented as a simulated response path, but it was not included in the logged manual validation set for this checkpoint. It should be covered by the next curl runbook or smoke test.

Validation limitation:

- The local machine did not have the `deno` CLI available, so direct `deno fmt` / `deno check` could not be run.
- Runtime validation through `npx supabase functions serve katarina-demo-tools` succeeded.

## Known Limitations

Current limitations:

- Not wired to Vapi yet.
- No production scheduling.
- Slots are deterministic demo data.
- Appointment creation is simulated.
- Reminder response recording is simulated.
- No audit log yet.
- No phone normalization beyond trim.
- No appointment rescheduling behavior.
- No SMS send path.
- No production Vapi auth/signature integration in this tool handler.

## Recommended Next Phase

Recommended next options:

1. Add Vapi tool configuration documentation.
2. Or create a local curl demo runbook for the 60-90 second script.
3. Add a smoke test covering `record_reminder_response`.
4. Keep production scheduling separate from the demo tools until the contract is reviewed.

## What Not To Do Next

- Do not add real appointment writes until the tool contract is reviewed.
- Do not send SMS from demo tools.
- Do not mix staff review RPCs into voice demo tools.
- Do not add external provider calls in this function.
- Do not turn the demo handler into a broad workflow engine.
