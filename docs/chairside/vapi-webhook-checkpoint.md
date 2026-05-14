# Chairside Vapi Webhook Checkpoint

This checkpoint summarizes the current `vapi-webhook` Edge Function skeleton.

## Purpose

`vapi-webhook` is the second provider integration boundary for Chairside. It exists to store raw Vapi-like webhook events safely in `public.provider_events` before any call or appointment business processing is implemented.

Current scope:

- Accept fake/test Vapi-like JSON events.
- Store raw event payloads in `public.provider_events`.
- Prepare the future voice/call ingestion boundary.
- Use the existing provider event deduplication boundary.
- Avoid `call_logs`, reminder, message, appointment, and booking processing.

It does not call Vapi APIs, book appointments, update calls, update reminders, update messages, update appointments, or call Telnyx, Telegram, or OpenClaw.

## Current Function

Function name:

```text
vapi-webhook
```

Current behavior:

- Accepts `POST` requests with a JSON object body.
- Rejects non-`POST` requests.
- Rejects invalid JSON.
- Rejects JSON bodies that are not objects.
- Stores one row in `public.provider_events`.
- Uses the service-role/admin Supabase client inside the Edge Function.
- Does not require Supabase user auth at the function config layer.

Field extraction:

- Extracts `provider_event_id` from:
  - `payload.message.id`
  - `payload.event_id`
  - `payload.id`
  - `payload.call.id`
- Extracts `event_type` from:
  - `payload.message.type`
  - `payload.type`
  - `payload.event_type`
- Extracts `resource_type` from:
  - `payload.message.type`
  - `payload.resource_type`
  - fallback `"call"`
- Extracts `resource_id` from:
  - `payload.call.id`
  - `payload.message.call.id`
  - `payload.resource_id`

Stored provider event shape:

```json
{
  "clinic_id": null,
  "provider": "vapi",
  "provider_event_id": "test-vapi-webhook-skeleton-001",
  "event_type": "call.ended",
  "resource_type": "call.ended",
  "resource_id": "fake-vapi-call-001",
  "processing_status": "received",
  "payload": {
    "message": {
      "id": "test-vapi-webhook-skeleton-001",
      "type": "call.ended",
      "call": {
        "id": "fake-vapi-call-001"
      }
    }
  }
}
```

`clinic_id` is always stored as `null` for now because event-to-clinic mapping is out of scope.

If `provider_event_id` is missing, the function creates a temporary fallback id using the event type and current timestamp. This is only a test fallback and is not a production idempotency strategy.

## Duplicate Behavior

`public.provider_events` has `unique(provider, provider_event_id)`.

The function relies on that constraint for deduplication:

- First delivery inserts a row and returns HTTP `200` with `status = "received"`.
- Repeated delivery with the same `provider_event_id` returns HTTP `200` with `status = "duplicate"`.
- Duplicate delivery does not create a second row.
- Duplicate delivery does not process any business logic.

Duplicate response shape:

```json
{
  "status": "duplicate",
  "provider": "vapi",
  "provider_event_id": "test-vapi-webhook-skeleton-001",
  "event_type": "call.ended"
}
```

## Local Validation Results

Local validation used a fake Vapi-like `call.ended` payload only.

Confirmed:

- Fake Vapi call-ended payload returned HTTP `200` with `status = "received"`.
- One `public.provider_events` row was created.
- Sending the same payload again returned HTTP `200` with `status = "duplicate"`.
- `provider_events` count for that `provider_event_id` stayed `1`.
- `call_logs` count was unchanged.
- `reminders` count was unchanged.
- `messages` count was unchanged.
- `appointments` count was unchanged.
- No real Vapi API call was made.
- No call, reminder, message, appointment, or booking business processing happened.

Example created local event:

```json
{
  "provider": "vapi",
  "provider_event_id": "test-vapi-webhook-skeleton-001",
  "event_type": "call.ended",
  "resource_type": "call.ended",
  "resource_id": "fake-vapi-call-001",
  "processing_status": "received",
  "clinic_id": null
}
```

## Security And Production Limitations

The function is not production-ready.

Current limitations:

- No Vapi signature verification yet.
- Payload fields are not trusted for business actions.
- `clinic_id` mapping is not implemented yet.
- Provider events are stored unmapped with `clinic_id = null`.
- Unmapped events are not visible to regular clinic users under current RLS.
- No provider secret should be exposed to frontend code.
- The function is not linked from UI.

Before production use, the webhook boundary needs Vapi signature verification and a clear mapping strategy for clinic, call, patient, appointment, and provider context.

## Known Limitations

- No event processing.
- No `call_logs` mapping yet.
- No appointment booking from calls.
- No reminder update.
- No message update.
- No appointment update.
- No activity log update.
- No idempotency table yet beyond `unique(provider, provider_event_id)`.
- Fallback `provider_event_id` uses current timestamp and is only a temporary test fallback.
- No retry/dead-letter strategy.
- No admin-only unmapped provider event workflow.

## Recommended Next Phase

Recommended options:

1. Define a provider event processing strategy.
2. Define explicit clinic, reminder, call, and patient mapping rules before downstream mutations.
3. Later add a Vapi `call_logs` processor after signature verification and mapping rules are explicit.
4. Later add a Telnyx inbound message processor after signature verification and reminder/message mapping rules are explicit.
5. Add signature verification before production provider use.

The safest next product slice is mapping and processing design, not direct business processing from raw webhook payloads.

## What Not To Do Next

- Do not process real calls directly from raw webhook payloads before signature verification.
- Do not book appointments from Vapi webhooks yet.
- Do not update `call_logs`, reminders, messages, or appointments from Vapi webhooks until mapping rules are explicit.
- Do not expose service-role credentials or provider secrets to frontend code.
- Do not make the provider events debug UI public.
- Do not connect full Vapi production behavior before event storage, signature, and idempotency boundaries are clear.
