# Katarina Local Demo Preflight

## Purpose

This checklist covers the local preflight for running the Katarina voice demo with Vapi. It bridges the local Supabase Edge Function `katarina-demo-tools` to Vapi through a public tunnel while keeping the flow demo-safe.

Use this before a live demo to confirm the function, auth header, tunnel, and scripted voice flow are all working.

## Prerequisites

- Local Supabase is running.
- The `katarina-demo-tools` Edge Function is available locally.
- A valid local Supabase user access token is available as `USER_TOKEN`.
- `ngrok` or a similar tunnel is installed and available.
- Vapi account access is available.
- No SMS sends, provider calls, or real appointment writes are expected from this demo flow.

## Local Startup

1. Confirm the working tree and branch before demo setup:

   ```bash
   git status --short
   git branch --show-current
   ```

   For a clean demo baseline, prefer running from `main` or the current demo branch with only intentional local changes.

2. Start local Supabase:

   ```bash
   npx supabase start
   ```

   Or use the project wrapper if you want the full local stack:

   ```bash
   make start
   ```

3. Serve the Katarina demo tool function:

   ```bash
   npx supabase functions serve katarina-demo-tools
   ```

   Keep this terminal running during the demo.

4. Set the local function URL:

   ```bash
   export FUNCTION_URL="http://127.0.0.1:54321/functions/v1/katarina-demo-tools"
   ```

5. Verify the endpoint responds to CORS preflight:

   ```bash
   curl -i -X OPTIONS "$FUNCTION_URL"
   ```

   Expected result: HTTP 204 or another successful CORS preflight response.

## Auth Token

The function expects a usable bearer token in the `Authorization` header.

Set the token:

```bash
export USER_TOKEN="<local-supabase-user-access-token>"
```

Quick sanity checks:

- A normal Supabase JWT usually starts with `eyJ`.
- If `USER_TOKEN` is empty, malformed, or expired, tool calls can fail with `401`, `Invalid JWT`, or an auth middleware error.
- To detect an expired token, run a simple authenticated tool call:

  ```bash
  curl -i "$FUNCTION_URL" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"tool":"list_available_slots","arguments":{"reason":"preventivna prehliadka"}}'
  ```

If the token is expired, sign in locally again and replace `USER_TOKEN`.

Fallback note: a local anon key should only be used if the current local `AuthMiddleware` accepts it for the exact test being run. The preferred demo path is an authenticated local user token because `lookup_patient_by_phone` reads through user-scoped Supabase/RLS.

Never put the service role key in Vapi headers, tunnel configuration, screenshots, or docs.

## Tunnel Setup

Expose the local Supabase Functions endpoint through a tunnel:

```bash
ngrok http 54321
```

Map the tunnel URL to the function route:

```text
https://<tunnel>/functions/v1/katarina-demo-tools
```

Use that tunneled function URL in Vapi.

Required Vapi headers:

```text
Authorization: Bearer <USER_TOKEN>
Content-Type: application/json
```

Do not expose or use a service role key.

## Vapi Configuration Checklist

- Assistant name: `Katarína`.
- Persona: Slovak dental receptionist, warm, concise, professional, one question at a time.
- Paste the Slovak system prompt from `katarina-vapi-demo-runbook.md` or `katarina-voice-demo-script.md`.
- Configure tools:
  - `lookup_patient_by_phone`
  - `list_available_slots`
  - `create_demo_appointment`
  - `record_reminder_response`
- Set tool endpoint:
  - local tunnel URL: `https://<tunnel>/functions/v1/katarina-demo-tools`
- Set headers:
  - `Authorization: Bearer <USER_TOKEN>`
  - `Content-Type: application/json`
- Test each tool from Vapi before running the voice call.

## Manual Curl Preflight

Set variables:

```bash
export FUNCTION_URL="http://127.0.0.1:54321/functions/v1/katarina-demo-tools"
export USER_TOKEN="<local-supabase-user-access-token>"
```

Unsupported tool:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"unknown_tool","arguments":{}}'
```

Expected result: `400` with `unsupported_tool`.

Lookup known patient:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"lookup_patient_by_phone","arguments":{"phone":"+420606777888"}}'
```

Expected result: `200` with Tomáš Svoboda if local seed/RLS context is available.

List demo slots:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"list_available_slots","arguments":{"reason":"preventivna prehliadka"}}'
```

Expected result: `200` with deterministic demo slots and `demo_mode: true`.

Create appointment without patient confirmation:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"create_demo_appointment","arguments":{"patient_id":"demo-patient","slot_start":"2026-05-20T10:30:00+02:00","reason":"preventivna prehliadka","confirmed_by_patient":false}}'
```

Expected result: `400` with `confirmation_required`.

Create appointment with patient confirmation:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"create_demo_appointment","arguments":{"patient_id":"demo-patient","slot_start":"2026-05-20T10:30:00+02:00","reason":"preventivna prehliadka","confirmed_by_patient":true}}'
```

Expected result: `200` simulated appointment with `demo_mode: true`, `writes_database: false`, and `sends_sms: false`.

Record reminder response simulated:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"record_reminder_response","arguments":{"reminder_id":"demo-reminder","response_status":"confirmed"}}'
```

Expected result: `200` simulated reminder response with `demo_mode: true`, `writes_database: false`, `sends_sms: false`, and `staff_review_rpc_used: false`.

## Demo Script Rehearsal

Target length: 60-90 seconds.

Expected flow:

1. Caller asks for a preventive dental check-up.
2. Katarína greets in Slovak and confirms the intent.
3. Katarína asks for or confirms the caller phone/name.
4. Katarína calls `lookup_patient_by_phone`.
5. Katarína calls `list_available_slots`.
6. Katarína offers 2-3 simple slots.
7. Caller chooses one slot.
8. Katarína asks for explicit confirmation.
9. Katarína calls `create_demo_appointment` only after confirmation.
10. Katarína confirms the simulated appointment and ends politely.

Optional reminder path:

1. Caller says they are responding to a reminder.
2. Katarína recognizes confirmation, decline, or uncertainty.
3. Katarína calls `record_reminder_response` only for the demo-safe simulated result.
4. Katarína does not send SMS and does not use staff review RPCs.

## Safety Checks Before Demo

- No SMS sends are expected.
- No real appointment DB writes are expected.
- No provider calls are expected.
- No staff review RPC usage is expected.
- No service role key is present in Vapi headers.
- The Vapi endpoint is the tunnel URL for local/demo mode.
- The assistant does not promise production scheduling, medical advice, insurance handling, payments, or automatic rescheduling.

## Troubleshooting

### Invalid JWT

Symptoms: `401`, `Invalid JWT`, or auth middleware failure.

Fix: refresh the local user access token and confirm it starts with `eyJ`. Re-run a curl preflight before testing in Vapi.

### Tunnel Unavailable

Symptoms: Vapi tool calls time out or cannot reach the endpoint.

Fix: confirm `ngrok http 54321` is running, copy the current tunnel URL, and update the Vapi tool endpoint.

### Unsupported Tool

Symptoms: `400 unsupported_tool`.

Fix: confirm Vapi sends one of the supported tool names exactly:

- `lookup_patient_by_phone`
- `list_available_slots`
- `create_demo_appointment`
- `record_reminder_response`

### patient_not_found

Symptoms: lookup returns `patient_not_found`.

Fix: confirm the phone number is `+420606777888`, the local database has the seeded patient, and the bearer token belongs to a user with clinic access through RLS.

### confirmation_required

Symptoms: `create_demo_appointment` returns `confirmation_required`.

Fix: make sure Vapi asks for explicit patient confirmation and sends `confirmed_by_patient: true`.

### CORS/OPTIONS Issue

Symptoms: browser-style preflight fails or Vapi reports header/method trouble.

Fix: run:

```bash
curl -i -X OPTIONS "$FUNCTION_URL"
```

Then confirm the function is being served and the tunnel points to port `54321`.

### Function Not Served

Symptoms: 404, connection refused, or no function logs.

Fix: confirm local Supabase is running and the function serve command is active:

```bash
npx supabase status
npx supabase functions serve katarina-demo-tools
```

## Done Criteria

- Curl preflight checks pass locally.
- Vapi tool tests pass through the tunnel.
- One full voice call completes the scripted booking demo.
- The demo remains local/demo-safe:
  - no SMS sends
  - no provider calls
  - no real appointment writes
  - no staff review RPC usage
  - no service role exposure
