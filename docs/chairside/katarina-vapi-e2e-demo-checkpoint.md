# Chairside Katarína Vapi E2E Demo Checkpoint

This checkpoint captures the first successful end-to-end Katarína Vapi voice demo.

## Purpose

This document records what worked in the first Vapi voice demo, what was adjusted to make the runtime path reliable, and what remains intentionally limited.

The checkpoint exists to:

- Capture the first working Vapi voice demo for Katarína.
- Document the runtime setup used for the successful call.
- Preserve the payload and auth adjustments that made Vapi runtime tool calls work.
- Keep the demo boundaries clear before any production scheduling work begins.

## Runtime Setup

The successful demo used local Supabase Edge Functions exposed through a public tunnel.

Runtime pieces:

- Local Supabase was running.
- `katarina-demo-tools` was served with:

  ```bash
  npx supabase functions serve katarina-demo-tools
  ```

- `ngrok` exposed local port `54321`.
- Vapi called the tunneled Supabase function route:

  ```text
  /functions/v1/katarina-demo-tools
  ```

- The local Vapi tool endpoint was:

  ```text
  https://<ngrok-tunnel>/functions/v1/katarina-demo-tools
  ```

For this demo function, `katarina-demo-tools` is configured with:

```toml
[functions.katarina-demo-tools]
verify_jwt = false
```

That setting allows Vapi runtime calls to reach the function even when Vapi does not send a Supabase `Authorization` header. The function keeps the demo-safe tools non-writing and keeps patient lookup guarded separately.

## Implemented Demo Tools Used

The successful Vapi voice run used these tools through `katarina-demo-tools`:

- `list_available_slots`
- `create_demo_appointment`

Both tools stayed inside the demo-safe boundary:

- No SMS sends.
- No provider calls.
- No real appointment database write.
- `create_demo_appointment` returned a simulated appointment result only.

## Payload And Auth Adjustments

Vapi runtime behavior differed from manual tool testing. The Vapi Test Tool worked with the explicit internal wrapper:

```json
{
  "tool": "list_available_slots",
  "arguments": {
    "reason": "preventive_checkup"
  }
}
```

During assistant runtime, Vapi sometimes sent a POST request with an empty body, and request body or headers were not reliably visible in local capture. The function was adjusted for demo resilience:

- Empty POST body falls back to `list_available_slots`.
- Empty body fallback uses `reason = preventive_checkup`.
- Empty body fallback marks `metadata.empty_body_fallback = true`.
- Direct argument payloads such as `reason`, `patient_id`, or `clinic_id` fall back to `list_available_slots`.
- Other valid JSON objects without a supported tool fall back to `list_available_slots`.
- Unknown-object fallback marks `metadata.unknown_object_fallback = true`.
- Demo-safe tools do not require `Authorization`.
- `lookup_patient_by_phone` still requires `Authorization` and returns a safe auth error when it is missing.

The fallback behavior is intentionally demo-oriented. It is not a production API contract.

## Successful Transcript Summary

Successful voice flow:

1. Patient asked to book a preventive check-up.
2. Katarína called `list_available_slots`.
3. Katarína offered:
   - `streda 10:30`
   - `štvrtok 14:00`
   - `piatok 9:15`
4. Patient chose Friday.
5. Katarína confirmed `piatok 9:15`.
6. Patient said yes.
7. Katarína called `create_demo_appointment`.
8. Katarína said:

   ```text
   Výborne, termín máte potvrdený. Tešíme sa na vás.
   ```

9. The call ended politely.

## Ngrok And Vapi Validation

Observed runtime validation:

- Vapi sent:

  ```text
  POST /functions/v1/katarina-demo-tools
  ```

- The endpoint returned `200 OK`.
- Vapi showed:
  - `List Available Slots Completed successfully`
  - `Create Demo Appointment Completed successfully`
- The endpoint response contained deterministic demo slots.
- No provider action occurred.
- No SMS action occurred.

## Vapi Config Notes

The Vapi assistant needed configuration support so it would actually use and speak the returned slots.

Working notes:

- `list_available_slots` needed aliases, messages, and prompt support so the assistant recognized the returned slots.
- Prompt rule added:

  ```text
  if list_available_slots succeeds, offer slots[].display_text_sk
  ```

- `create_demo_appointment` was added after patient confirmation.
- The assistant should not claim SMS was sent.
- The assistant should communicate only the patient-facing result, not Vapi, Supabase, ngrok, RPCs, or provider internals.

## Known Limitations

Current limitations:

- Vapi request body and headers were not reliably visible or captured.
- Fallback behavior is demo-oriented, not a production API contract.
- Appointment creation is simulated.
- Slots are deterministic demo slots.
- No real scheduling availability check runs.
- No staff note or audit log is created for the voice demo.
- This is not yet deployed as a production Vapi integration.

## Safety Boundaries

Safety boundaries preserved in the successful demo:

- No real appointment writes.
- No SMS sends.
- No Telnyx, Vapi, or other provider outbound actions from the function.
- No staff-review RPC usage.
- No service role exposed.
- No medical advice.
- No insurance advice.
- No payment advice.

## Recommended Next Phase

Recommended next steps:

1. Record a clean 60-90 second demo run.
2. Optionally add top-level response fields such as `first_slot`, `second_slot`, `third_slot`, and `spoken_summary` to make Vapi mapping easier.
3. Decide separately whether to build production-safe booking tools with explicit guardrails.
4. Do not expand the CRM debug flow right now.

## What Not To Do Next

- Do not turn the demo fallbacks into the production contract.
- Do not add real appointment writes without explicit guardrails.
- Do not send SMS from voice demo tools.
- Do not bypass safety boundaries for production.
