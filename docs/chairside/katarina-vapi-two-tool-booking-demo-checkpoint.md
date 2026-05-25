# Chairside Katarína Vapi Two-Tool Booking Demo Checkpoint

This checkpoint captures the first successful end-to-end Vapi voice booking demo using two demo-safe tools.

## Purpose

This document records the first working Katarína voice booking demo where Vapi successfully used both slot listing and simulated appointment creation.

It exists to:

- Capture the first successful end-to-end Vapi voice booking demo using two tools.
- Document the exact demo behavior that worked.
- Separate demo-safe behavior from production scheduling.
- Preserve the safety boundaries before any production booking design begins.

## Runtime Setup

The successful demo used local Supabase Edge Functions exposed through an ngrok tunnel.

Runtime pieces:

- Local Supabase was running.
- `katarina-demo-tools` was served locally with:

  ```bash
  npx supabase functions serve katarina-demo-tools
  ```

- `ngrok` tunneled local port `54321`.
- Vapi called this endpoint path:

  ```text
  /functions/v1/katarina-demo-tools
  ```

- The full Vapi endpoint used the active ngrok domain plus the Supabase function path:

  ```text
  https://<ngrok-tunnel>/functions/v1/katarina-demo-tools
  ```

For demo-safe Vapi runtime calls, the function is configured with:

```toml
[functions.katarina-demo-tools]
verify_jwt = false
```

No `Authorization` header is required for the demo-safe `list_available_slots` and `create_demo_appointment` tools. Patient lookup remains separately guarded.

## Tools Used

The successful call used:

- `list_available_slots`
- `create_demo_appointment`

Both were invoked through `katarina-demo-tools`.

Safety behavior confirmed:

- No real appointment database write.
- No SMS send.
- No provider call.
- `create_demo_appointment` returned a simulated `demo-*` appointment only.

## Successful Transcript Summary

Successful voice flow:

1. The assistant greeted as a Slovak dental receptionist.
2. The patient asked to book a preventive check-up.
3. `List Available Slots` completed successfully.
4. Katarína offered:
   - `streda 10:30`
   - `štvrtok 14:00`
   - `piatok 9:15`
5. The patient chose Friday.
6. Katarína repeated `piatok 9:15` and asked for confirmation.
7. The patient confirmed.
8. `Create Demo Appointment` completed successfully.
9. Katarína said:

   ```text
   Výborne, termín máte potvrdený. Tešíme sa na vás.
   ```

10. The call ended politely.

## Vapi Configuration Notes

The Vapi configuration needed explicit support so the assistant would use the returned slot data naturally.

Working notes:

- `list_available_slots` required prompt, alias, and message support so the assistant used the returned slots.
- Prompt rule:

  ```text
  if list_available_slots succeeds, offer slots/display terms and do not say no slots are available
  ```

- `create_demo_appointment` is called only after explicit patient confirmation.
- The assistant must not claim SMS was sent.
- Async was `OFF` for demo tools.
- Strict was `OFF` for demo tools.
- `Content-Type` header only is enough for demo-safe tools after the no-JWT function config.

## Payload And Fallback Notes

Runtime payload behavior required tolerant demo handling:

- Vapi sometimes sent an empty POST body.
- Empty-body fallback returns deterministic slots.
- Unknown-object fallback supports Vapi-like payloads whose exact shape was not reliably visible.
- Direct argument payloads can map to `list_available_slots`.
- Fallback behavior is demo-oriented and is not a production API contract.
- `lookup_patient_by_phone` still requires `Authorization` or returns a safe auth error.

## Safety Boundaries

The successful demo preserved these boundaries:

- No real appointment writes.
- No SMS sends.
- No provider calls.
- No staff-review RPC usage.
- No service role exposed.
- No medical advice.
- No insurance advice.
- No payment advice.

## Known Limitations

Current limitations:

- Appointment creation is simulated.
- Slots are deterministic demo slots only.
- No production availability engine is used.
- No real patient lookup occurred in this successful call.
- Vapi request body and header capture remained limited.
- Aliases and prompt behavior are manually configured in Vapi and are not versioned in this repo.

## Recommended Next Phase

Recommended next steps:

1. Record a clean 60-90 second demo video or audio run.
2. Optionally add top-level response fields to make Vapi mapping easier:
   - `first_slot`
   - `second_slot`
   - `third_slot`
   - `spoken_summary`
3. Only later design production-safe booking writes.
4. Keep the staff review flow separate.

## What Not To Do Next

- Do not turn demo fallbacks into a production API contract.
- Do not add real appointment writes without guardrails.
- Do not send SMS from voice demo tools.
- Do not expand into a generic AI OS or non-dental ICP.
