# Chairside Katarína Demo Tool Contract

This document defines a minimal demo-safe tool interface for Katarína before implementation.

## Purpose

The purpose of this contract is to define stable tool names and request/response shapes for the 60-90 second Katarína voice demo.

It exists to:

- Support a short Slovak dental receptionist demo.
- Keep the first voice slice small and demo-safe.
- Avoid production scheduling complexity.
- Avoid coupling the voice demo to staff review internals.
- Provide names and JSON shapes suitable for Vapi function/tool calling.

This contract is not a production scheduling API design.

## Proposed Tools

The proposed demo tools are:

- `lookup_patient_by_phone`
- `list_available_slots`
- `create_demo_appointment`
- `record_reminder_response`

These names should remain stable for the first Vapi/tool-calling experiment.

## Input And Output Schemas

### lookup_patient_by_phone

Purpose:

- Find an existing patient by caller phone number.
- Let Katarína greet or confirm the patient naturally.

Data behavior:

- Read-only.
- Does not create patients.
- Does not update reminders, appointments, messages, or call logs.

Request example:

```json
{
  "tool": "lookup_patient_by_phone",
  "phone": "+420606777888",
  "clinic_id": "demo-clinic-id"
}
```

Success response example:

```json
{
  "status": "found",
  "patient": {
    "id": "demo-patient-id",
    "name": "Tomáš Svoboda",
    "phone": "+420606777888"
  },
  "spoken_summary_sk": "Našla som pacienta Tomáš Svoboda."
}
```

Unknown patient response example:

```json
{
  "status": "not_found",
  "patient": null,
  "spoken_summary_sk": "Pacienta podľa tohto čísla nevidím. Môžem si, prosím, overiť vaše meno?"
}
```

Error response example:

```json
{
  "status": "error",
  "code": "invalid_phone",
  "message": "Phone number is missing or invalid.",
  "spoken_summary_sk": "Telefónne číslo sa mi nepodarilo overiť. Poprosím vás, zopakujte ho."
}
```

### list_available_slots

Purpose:

- Return two or three simple available slots for a check-up demo.
- Keep slot options easy for Katarína to say out loud.

Data behavior:

- Read-only.
- May call existing availability logic later.
- For the first demo slice, deterministic demo slots are acceptable if real slot search is not ready.
- Does not create or change appointments.

Request example:

```json
{
  "tool": "list_available_slots",
  "clinic_id": "demo-clinic-id",
  "patient_id": "demo-patient-id",
  "service_key": "preventive_checkup",
  "preferred_day": "next_week"
}
```

Success response example:

```json
{
  "status": "ok",
  "timezone": "Europe/Bratislava",
  "slots": [
    {
      "slot_id": "demo-slot-1",
      "starts_at": "2026-05-20T08:30:00.000Z",
      "ends_at": "2026-05-20T09:00:00.000Z",
      "display_text_sk": "v stredu o 10:30"
    },
    {
      "slot_id": "demo-slot-2",
      "starts_at": "2026-05-21T12:00:00.000Z",
      "ends_at": "2026-05-21T12:30:00.000Z",
      "display_text_sk": "vo štvrtok o 14:00"
    },
    {
      "slot_id": "demo-slot-3",
      "starts_at": "2026-05-22T07:15:00.000Z",
      "ends_at": "2026-05-22T07:45:00.000Z",
      "display_text_sk": "v piatok o 9:15"
    }
  ],
  "spoken_summary_sk": "Mám pre vás stredu o 10:30, štvrtok o 14:00 alebo piatok o 9:15."
}
```

No available slot response example:

```json
{
  "status": "no_slots",
  "slots": [],
  "spoken_summary_sk": "V týchto termínoch nevidím voľné miesto. Recepcia vám radšej zavolá späť s ďalšími možnosťami."
}
```

Error response example:

```json
{
  "status": "error",
  "code": "missing_service",
  "message": "service_key or service_id is required.",
  "spoken_summary_sk": "Nepodarilo sa mi vybrať typ návštevy. Overí to recepcia."
}
```

### create_demo_appointment

Purpose:

- Create or simulate one appointment after the caller explicitly chooses a slot.
- Keep booking intentional and easy to audit.

Data behavior:

- Write action.
- Must be explicit and guarded.
- Should only run after Katarína repeats the selected day/time and the patient confirms.
- First implementation may simulate the booking or create a demo appointment through a narrow server-side boundary.
- Does not send SMS.
- Does not reschedule or cancel existing appointments.

Request example:

```json
{
  "tool": "create_demo_appointment",
  "clinic_id": "demo-clinic-id",
  "patient_id": "demo-patient-id",
  "service_key": "preventive_checkup",
  "slot_id": "demo-slot-2",
  "starts_at": "2026-05-21T12:00:00.000Z",
  "patient_confirmed": true,
  "source": "ai_voice"
}
```

Success response example:

```json
{
  "status": "created",
  "appointment": {
    "id": "demo-appointment-id",
    "status": "scheduled",
    "starts_at": "2026-05-21T12:00:00.000Z",
    "display_text_sk": "vo štvrtok o 14:00"
  },
  "spoken_summary_sk": "Potvrdzujem preventívnu prehliadku vo štvrtok o 14:00."
}
```

Simulated success response example:

```json
{
  "status": "simulated",
  "appointment": {
    "id": null,
    "status": "simulated",
    "starts_at": "2026-05-21T12:00:00.000Z",
    "display_text_sk": "vo štvrtok o 14:00"
  },
  "spoken_summary_sk": "Pre demo potvrdzujem preventívnu prehliadku vo štvrtok o 14:00."
}
```

Guard failure response example:

```json
{
  "status": "error",
  "code": "confirmation_required",
  "message": "Patient confirmation is required before creating a demo appointment.",
  "spoken_summary_sk": "Pred vytvorením termínu si ešte potrebujem potvrdiť, že vám tento čas vyhovuje."
}
```

### record_reminder_response

Purpose:

- Record a simple reminder confirmation/decline only when the reminder is safely known.
- Support an optional reminder branch in the voice demo.

Data behavior:

- Optional write action.
- Should not reuse staff review RPCs unless that is explicitly designed later.
- Should not modify staff review metadata.
- Should not update appointments.
- Should not send SMS.

Request example:

```json
{
  "tool": "record_reminder_response",
  "clinic_id": "demo-clinic-id",
  "patient_id": "demo-patient-id",
  "reminder_id": "demo-reminder-id",
  "response": "confirmed",
  "raw_text": "Ten zajtrajší termín mi vyhovuje.",
  "source": "ai_voice"
}
```

Success response example:

```json
{
  "status": "recorded",
  "reminder": {
    "id": "demo-reminder-id",
    "response_status": "confirmed",
    "needs_staff_review": false
  },
  "spoken_summary_sk": "Rozumiem, termín je potvrdený."
}
```

Needs review response example:

```json
{
  "status": "needs_review",
  "reminder": {
    "id": "demo-reminder-id",
    "response_status": "needs_review",
    "needs_staff_review": true
  },
  "spoken_summary_sk": "Zapísala som, že termín treba preveriť. Recepcia sa vám ozve."
}
```

No safe match response example:

```json
{
  "status": "not_recorded",
  "code": "no_safe_reminder_match",
  "spoken_summary_sk": "Neviem bezpečne priradiť pripomienku. Recepcia sa vám ozve späť."
}
```

## Demo Constraints

The first implementation must stay local/demo-safe.

Constraints:

- No SMS sends.
- No payment discussion.
- No insurance discussion.
- No medical advice.
- No staff review changes.
- No broad CRM changes.
- No appointment reschedule automation yet.
- No production provider credentials required.
- No raw provider payloads returned to Vapi or displayed to patients.

The demo tools should support the scripted call, not a full scheduling product.

## Data Behavior Summary

| Tool | Reads | Writes | Notes |
| --- | --- | --- | --- |
| `lookup_patient_by_phone` | Patients | None | Read-only lookup. |
| `list_available_slots` | Services, appointments, clinic config, or deterministic demo data | None | Can be deterministic for first demo. |
| `create_demo_appointment` | Patient, service, slot context | Appointment or simulated booking record | Must require explicit confirmation. |
| `record_reminder_response` | Reminder context | Optional reminder/message record | Optional; keep separate from staff review RPCs unless designed later. |

`create_demo_appointment` is the main guarded write. It must not run until the patient has chosen and confirmed a slot.

`record_reminder_response` is optional for the demo. It should not reuse `resolve_inbound_response_keep_existing` or `resolve_inbound_response_accept_inbound` unless a future design explicitly connects voice resolution to staff review workflows.

## Safety And Guardrails

Required guardrails:

- Require explicit patient confirmation before booking.
- If patient identity is uncertain, ask one clarifying question or hand off to staff.
- If slot selection is uncertain, do not book.
- If reminder matching is uncertain, do not update reminder state.
- No destructive actions.
- No cancellation or rescheduling automation.
- No provider raw payload exposure.
- No secrets in responses, logs, docs examples, or frontend code.

Fallback phrase for uncertainty:

```text
Toto radšej overí recepcia. Poprosím vás o telefónne číslo a kolegyňa sa vám ozve.
```

## Recommended First Implementation

Recommended implementation shape:

- Create one dedicated Edge Function or internal handler for Katarína demo tools.
- Keep it separate from:
  - `vapi-webhook`
  - `process-provider-event`
  - Staff review RPCs
  - Telnyx SMS processing
- Accept one request envelope with a stable `tool` name and `arguments`.
- Return short `spoken_summary_sk` strings designed for Katarína to say.
- Use deterministic slots for the first demo if real slot search is not ready.
- Log enough for local debugging:
  - tool name
  - request id
  - demo clinic id
  - outcome status
- Do not log secrets, raw provider credentials, or full provider payloads.

Suggested request envelope:

```json
{
  "tool": "list_available_slots",
  "arguments": {
    "clinic_id": "demo-clinic-id",
    "patient_id": "demo-patient-id",
    "service_key": "preventive_checkup"
  },
  "request_id": "demo-request-001"
}
```

Suggested response envelope:

```json
{
  "tool": "list_available_slots",
  "request_id": "demo-request-001",
  "status": "ok",
  "result": {
    "timezone": "Europe/Bratislava",
    "slots": []
  },
  "spoken_summary_sk": "Mám pre vás niekoľko voľných termínov."
}
```

## Test Plan

Testing can start with manual local calls against the demo handler.

Example manual call shape:

```bash
curl -i http://127.0.0.1:54321/functions/v1/katarina-demo-tools \
  -H "Authorization: Bearer <local-test-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "lookup_patient_by_phone",
    "arguments": {
      "phone": "+420606777888",
      "clinic_id": "demo-clinic-id"
    },
    "request_id": "demo-smoke-001"
  }'
```

Minimum test cases:

1. Happy path booking:
   - `lookup_patient_by_phone` returns a known patient.
   - `list_available_slots` returns two or three slots.
   - `create_demo_appointment` succeeds only after `patient_confirmed = true`.
2. Unknown patient path:
   - Lookup returns `not_found`.
   - Katarína asks for name/phone or hands off.
3. No available slot path:
   - Slots response returns `no_slots`.
   - Katarína says staff will call back with options.
4. Invalid or missing phone path:
   - Lookup returns `invalid_phone`.
   - Katarína asks the caller to repeat the number.

Additional manual checks:

- Missing `tool` returns a safe error.
- Unknown `tool` returns a safe error.
- `create_demo_appointment` without `patient_confirmed = true` returns `confirmation_required`.
- `record_reminder_response` without a safe `reminder_id` returns `no_safe_reminder_match`.

## Acceptance Criteria

The first implementation is acceptable when:

- The contract can be used by Vapi tool calls.
- The scripted Slovak Katarína demo can complete with the tool responses.
- One happy path booking works.
- Unknown patient and no-slot paths are safe and demo-friendly.
- No unrelated runtime changes are required.
- No staff review behavior changes are introduced.
- No SMS/provider side effects happen.
- The demo handler is easy to remove, replace, or evolve into a production implementation later.

## What Not To Do Next

- Do not wire this directly into production Vapi behavior before auth and logging are explicit.
- Do not reuse staff review RPCs for voice reminder handling without a separate design.
- Do not send SMS from the demo tools.
- Do not add payment, insurance, or medical-advice behavior.
- Do not add appointment rescheduling automation.
- Do not broaden Chairside into a generic workflow platform.
