# Chairside Katarína Vapi Demo Runbook

This runbook connects the 60-90 second Katarína voice demo script to a future Vapi assistant configuration.

## Purpose

The purpose of this runbook is to make the Katarína demo configurable and repeatable without expanding production scope.

It exists to:

- Connect the scripted Slovak Katarína demo to Vapi configuration.
- Keep the first voice demo local/demo-safe.
- Avoid production scheduling complexity.
- Keep staff review, Telnyx, and provider processing flows separate.

This runbook does not enable production voice scheduling.

## Prerequisites

Required local setup:

- Local Supabase is running.
- `katarina-demo-tools` Edge Function is available.
- A valid authenticated Supabase user token is available for local testing.
- If Vapi needs to call the local function, a public tunnel is required.

Local function route:

```text
http://127.0.0.1:54321/functions/v1/katarina-demo-tools
```

Tunnel placeholder:

```text
https://<tunnel>/functions/v1/katarina-demo-tools
```

Important boundaries:

- Demo tools do not send SMS.
- Demo tools do not call Vapi, Telnyx, Telegram, OpenClaw, or other providers.
- `create_demo_appointment` returns a simulated appointment.
- `record_reminder_response` returns a simulated reminder response.
- Staff review RPCs are not used by the demo tools.

## Assistant Persona And Config

Assistant name:

```text
Katarína
```

Persona:

- Slovak dental receptionist.
- Warm, concise, and professional.
- Asks one question at a time.
- Confirms key details before acting.
- Does not provide medical advice.
- Hands off to staff on uncertainty.

Demo positioning:

- Katarína helps with a simple check-up booking.
- Katarína may acknowledge reminder confirmation/reschedule intent.
- Katarína does not imply full production scheduling, SMS sending, or rescheduling automation.

## System Prompt Draft

Ready-to-paste Slovak prompt:

```text
Si Katarína, hlasová AI recepčná pre slovenskú zubnú ambulanciu.

Hovor po slovensky, prirodzene, stručne a profesionálne. Tvoj tón je pokojný, milý a recepčný, nie marketingový. Pýtaj sa vždy iba jednu otázku naraz.

Tvoj hlavný cieľ v deme je pomôcť pacientovi objednať sa na preventívnu prehliadku. Potvrď jednoduché údaje pacienta, ponúkni 2 až 3 dostupné termíny a po výbere termínu jasne zopakuj výsledok.

Nikdy neposkytuj medicínske rady, diagnózy, odporúčania liekov, poistné informácie ani platobné informácie. Ak pacient žiada medicínsku radu, povedz, že to musí posúdiť lekár alebo recepcia.

Nepredstieraj, že vieš meniť termíny bez potvrdenia. Zmenu alebo zrušenie termínu rieš iba cez dostupný demo nástroj alebo odovzdaj na recepciu.

Nespomínaj technické systémy ako Vapi, Telnyx, Supabase, provider_events alebo RPC. Pacientovi komunikuj iba výsledok.

Používaj nástroje iba vtedy, keď máš potrebné údaje:
- lookup_patient_by_phone: keď potrebuješ overiť pacienta podľa telefónu.
- list_available_slots: keď pacient chce nový termín alebo preventívnu prehliadku.
- create_demo_appointment: až keď pacient explicitne vyberie ponúknutý termín a potvrdí, že ho chce.
- record_reminder_response: iba keď pacient jasne potvrdí alebo odmietne existujúci pripomienkový termín.

Pred vytvorením demo termínu vždy zopakuj deň a čas a získaj jasný súhlas pacienta.

Ak nerozumieš, spýtaj sa jednu stručnú doplňujúcu otázku. Ak si stále nie si istá, povedz:
Toto radšej overí recepcia. Poprosím vás o telefónne číslo a kolegyňa sa vám ozve.
```

## Tool Mapping

All tools call the same endpoint with:

```json
{
  "tool": "tool_name",
  "arguments": {}
}
```

### lookup_patient_by_phone

When to call:

- After the caller phone is known.
- When Katarína needs to confirm patient identity.

Request summary:

```json
{
  "tool": "lookup_patient_by_phone",
  "arguments": {
    "phone": "+420606777888"
  }
}
```

Response summary:

- `ok = true` with `patient`.
- Or `ok = false`, `error = patient_not_found`.

### list_available_slots

When to call:

- After the caller asks for a check-up appointment.
- After Katarína has enough context to offer slots.

Request summary:

```json
{
  "tool": "list_available_slots",
  "arguments": {
    "reason": "preventive_checkup"
  }
}
```

Response summary:

- `ok = true`
- `slots` contains deterministic demo slots.
- `metadata.source = deterministic_demo_slots`

### create_demo_appointment

When to call:

- Only after the patient chooses a slot.
- Only after Katarína repeats the day/time and the patient confirms.

Request summary:

```json
{
  "tool": "create_demo_appointment",
  "arguments": {
    "patient_id": "demo-patient-id",
    "slot_start": "2026-05-21T12:00:00.000Z",
    "reason": "preventive_checkup",
    "confirmed_by_patient": true
  }
}
```

Response summary:

- `ok = true`
- `demo_mode = true`
- Simulated appointment id starts with `demo-`
- `metadata.writes_database = false`
- `metadata.sends_sms = false`

### record_reminder_response

When to call:

- Only for the optional reminder branch.
- Only when a safe reminder id is already known in the demo context.

Request summary:

```json
{
  "tool": "record_reminder_response",
  "arguments": {
    "reminder_id": "demo-reminder-id",
    "response_status": "confirmed"
  }
}
```

Response summary:

- `ok = true`
- `demo_mode = true`
- Simulated reminder response.
- `metadata.writes_database = false`
- `metadata.sends_sms = false`
- `metadata.staff_review_rpc_used = false`

## Endpoint

Local endpoint:

```text
http://127.0.0.1:54321/functions/v1/katarina-demo-tools
```

Tunnel endpoint placeholder:

```text
https://<tunnel>/functions/v1/katarina-demo-tools
```

Required headers:

```text
Authorization: Bearer <token>
Content-Type: application/json
```

Token note:

- The current function uses `AuthMiddleware`.
- Local manual tests should use a valid Supabase user access token.
- For Vapi, use a demo-safe token only in a controlled test configuration.
- Do not commit real tokens or expose them in frontend code.

## Demo Call Script

Concise primary script:

```text
Katarína:
Dobrý deň, tu je zubná ambulancia Praxma, pri telefóne Katarína. Ako vám môžem pomôcť?

Pacient:
Dobrý deň, chcem sa objednať na preventívnu prehliadku.

Katarína:
Samozrejme. Ste už u nás pacientom, alebo voláte prvýkrát?

Pacient:
Som u vás pacient. Volám sa Tomáš Svoboda.

Katarína:
Ďakujem. Môžem si potvrdiť telefónne číslo, z ktorého voláte, končí sa na 888?

Pacient:
Áno.

Katarína:
Pozriem najbližšie voľné termíny. Mám stredu o 10:30, štvrtok o 14:00 alebo piatok o 9:15. Ktorý vám vyhovuje?

Pacient:
Štvrtok o druhej.

Katarína:
Potvrdzujem preventívnu prehliadku vo štvrtok o 14:00. Prajete si ešte niečo doplniť?

Pacient:
Nie, ďakujem.

Katarína:
Ďakujem, termín je pripravený. Prajem pekný deň.
```

Expected tool sequence:

1. `lookup_patient_by_phone`
2. `list_available_slots`
3. `create_demo_appointment`

Optional reminder branch can call:

4. `record_reminder_response`

## Manual Preflight Curl Checks

Set local values first:

```bash
FUNCTION_URL="http://127.0.0.1:54321/functions/v1/katarina-demo-tools"
TOKEN="<local-user-token>"
```

Unsupported tool:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"unknown_tool","arguments":{}}'
```

Lookup patient:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"lookup_patient_by_phone","arguments":{"phone":"+420606777888"}}'
```

List slots:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"list_available_slots","arguments":{"reason":"preventive_checkup"}}'
```

Create confirmed demo appointment:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool":"create_demo_appointment",
    "arguments":{
      "patient_id":"demo-patient-id",
      "slot_start":"2026-05-21T12:00:00.000Z",
      "reason":"preventive_checkup",
      "confirmed_by_patient":true
    }
  }'
```

Record reminder response simulated:

```bash
curl -i "$FUNCTION_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool":"record_reminder_response",
    "arguments":{
      "reminder_id":"demo-reminder-id",
      "response_status":"confirmed"
    }
  }'
```

Expected preflight results:

- Unsupported tool returns `400 unsupported_tool`.
- Lookup for `+420606777888` returns Tomáš Svoboda in local seeded/test data.
- Slot listing returns deterministic demo slots.
- Confirmed appointment returns `demo_mode = true` and `writes_database = false`.
- Reminder response returns simulated result and `staff_review_rpc_used = false`.

## Failure Handling

Patient not found:

- Katarína should ask for the caller's name and phone.
- Do not create a new patient in this demo slice unless explicitly added later.

No slot chosen:

- Do not call `create_demo_appointment`.
- Ask one clarifying question or offer the slots again.

Tool error:

- Apologize briefly.
- Hand off to staff.

Invalid response:

- Ask the caller to repeat.
- If still unclear, say staff will call back.

Tunnel unavailable:

- Do not continue pretending the booking succeeded.
- Say staff will call back.

Auth token expired:

- Tool calls will fail.
- Refresh the token before the demo.
- Do not put long-lived secrets in Vapi config unless that security model is deliberately accepted for a controlled demo.

## Guardrails

Guardrails for this runbook:

- Do not add appointment writes unless the demo tool explicitly simulates or a later reviewed implementation adds them.
- Do not send SMS from demo tools.
- Do not use staff review RPCs from the voice demo tools.
- Do not provide medical, insurance, or payment advice.
- Do not promise production readiness.
- Do not expose provider raw payloads.
- Do not commit tokens, provider credentials, or tunnel secrets.

## Acceptance Criteria

The Vapi demo setup is acceptable when:

- One Vapi call can complete the scripted booking demo.
- Tool calls return deterministic results.
- Katarína stays in Slovak and asks one question at a time.
- The demo can be explained in under 90 seconds.
- No unrelated runtime changes are required.
- No SMS/provider side effects happen.
- No staff review behavior changes are required.

## Next Implementation Step

Recommended next step:

1. Configure the Vapi assistant manually using this runbook.
2. Use a temporary public tunnel only for the local demo.
3. Run the manual preflight curl checks before the call.
4. If needed later, add a small environment/config document for the demo.
5. Keep production booking, production Vapi auth, and real provider behavior separate.
