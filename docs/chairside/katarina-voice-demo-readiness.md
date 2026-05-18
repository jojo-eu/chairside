# Chairside Katarína Voice Demo Readiness

This checkpoint summarizes readiness for the next product-facing slice: a short Slovak voice demo for AI receptionist Katarína.

## Current Completed Foundation

Chairside now has a useful provider and reminder-response foundation for a focused voice demo.

Completed foundation:

- Inbound Telnyx reminder responses can be processed into inbound `messages`.
- Repeat and conflicting inbound responses can be marked with `metadata.needs_staff_review = true`.
- Staff can resolve review rows through:
  - `keep_existing`, which keeps the current reminder `response_status`.
  - `accept_inbound_response`, which accepts the parsed SMS response as the reminder `response_status`.
- `/internal/inbound-responses` shows inbound reminder responses, unresolved review rows, resolved review rows, human context, and staff review metadata.
- Provider event ingestion and processing foundations exist:
  - Telnyx webhook boundary.
  - Vapi webhook boundary.
  - Provider mappings.
  - Provider event clinic mapping.
  - Provider event processing attempts.
  - `process-provider-event` processor path.

This is enough to demonstrate the product loop around reminders and staff-visible follow-up, but it is not yet a production voice integration.

## Product Goal

The next product-facing slice should be a 60-90 second Slovak dental voice demo.

Demo concept:

- AI receptionist name: `Katarína`
- Audience: Slovak and Czech dental clinics
- Language: Slovak first
- Primary focus:
  - Check-up booking
  - Appointment confirmation or reminder response handling
- Goal: show a clear, believable dental receptionist workflow without implying full production scheduling automation.

## What Should Be In Demo

The demo should show one simple call path:

1. Patient calls the clinic.
2. Katarína greets the patient in Slovak.
3. Katarína identifies intent:
   - Check-up booking, or
   - Appointment confirmation/reschedule intent from a reminder context.
4. Katarína offers two or three simple available slots.
5. Patient chooses one slot.
6. Katarína confirms the chosen slot.
7. Optionally, Katarína records a reminder response when the call is about an existing reminder.
8. Katarína ends politely.

The script should feel like a dental clinic receptionist, not a generic AI assistant.

## What Should Not Be In Demo Yet

The demo should avoid:

- Full production scheduling complexity.
- Insurance advice.
- Medical advice.
- Payments.
- Generic AI OS positioning.
- Workflow-builder or broad automation positioning.
- WhatsApp-first scope.
- Expanding staff review UI beyond the current focused review actions.
- Appointment rescheduling automation without explicit guardrails.

The demo should not imply that production Vapi/Telnyx voice processing, production signature verification, or automated appointment rescheduling is complete.

## Technical Readiness

Relevant existing Supabase foundation:

- `patients`
- `appointments`
- `services`
- `reminders`
- `messages`
- `call_logs`
- `provider_events`
- `provider_event_processing_attempts`
- `provider_mappings`

Relevant existing function boundaries:

- `check-availability`
- `book-appointment`
- `telnyx-webhook`
- `vapi-webhook`
- `lookup-provider-mapping`
- `map-provider-event-clinic`
- `process-provider-event`
- Staff review RPCs:
  - `resolve_inbound_response_keep_existing`
  - `resolve_inbound_response_accept_inbound`

Relevant internal/debug pages:

- `/internal/inbound-responses`
- Provider events debug view
- Provider mappings debug view
- Provider processing attempts debug view

Current gaps for Vapi/Telnyx voice wiring:

- No production Vapi HMAC/signature verification.
- No Vapi call-log business processor yet.
- No live voice tool orchestration wired to booking functions.
- No production-safe appointment update/reschedule flow from voice.
- No demo-specific voice agent prompt or script yet.
- No explicit tool contract for Katarína's voice flow yet.

## Recommended Next Implementation Slice

Recommended next slice: define a demo-safe local voice flow before wiring production provider behavior.

Implement or document:

1. Voice agent prompt for Katarína.
2. 60-90 second demo script.
3. Tool contract or webhook shape for:
   - Lookup patient by phone.
   - List two or three available slots.
   - Create a tentative appointment or simulated booking record.
4. Demo-safe local flow that can be validated without real provider credentials.

The initial voice slice should be intentionally narrow. It should prove the story and interaction quality before adding more provider complexity.

## Risks And Guardrails

Guardrails:

- Do not update appointments from voice without a clear tool boundary.
- Do not send SMS automatically from the voice slice.
- Do not expose raw provider payloads.
- Do not expose provider secrets.
- Keep Telegram as regression test only, not a product-facing channel.
- Keep the product focused on the dentist/clinic ICP.
- Keep Vapi, Telnyx, and booking state changes behind explicit server-side boundaries.

Risk areas:

- Voice demos can accidentally imply production readiness.
- Rescheduling can create hidden appointment-state complexity.
- Provider payloads are not trusted business commands without auth, mapping, and idempotency.
- A broad "AI receptionist platform" story can dilute the dental-clinic wedge.

## Acceptance Criteria For Next Slice

The next slice is ready when:

- One scripted call path works end to end.
- Slovak conversation quality is natural enough for a demo.
- Katarína can explain, offer, and confirm a simple check-up slot.
- Reminder-response handling can be explained without expanding staff review workflow.
- No broad CRM changes are introduced.
- No unrelated product channels are added.
- The demo can be explained in under 90 seconds.

## What Not To Do Next

- Do not turn this into a generic AI OS demo.
- Do not add WhatsApp-first scope.
- Do not automate appointment rescheduling without explicit guardrails.
- Do not update appointments directly from raw voice/provider events.
- Do not send patient SMS replies from the voice demo slice.
- Do not broaden staff review UI while building the voice demo.
