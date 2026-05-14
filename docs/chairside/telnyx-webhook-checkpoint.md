# Chairside Telnyx Webhook Checkpoint

This checkpoint summarizes the current `telnyx-webhook` Edge Function skeleton.

## Purpose

`telnyx-webhook` is the first provider integration boundary for Chairside. It exists to store raw Telnyx-like webhook events safely in `public.provider_events` before any business processing is implemented.

Current scope:

- Accept fake/test Telnyx-like JSON events.
- Store raw event payloads in `public.provider_events`.
- Use the existing provider event deduplication boundary.
- Avoid reminder, message, appointment, and patient-response processing.

It does not send SMS, call Telnyx APIs, process patient replies, update appointment/reminder state, or call Vapi, Telegram, or OpenClaw.

## Current Function

Function name:

```text
telnyx-webhook
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
  - `payload.data.id`
  - `payload.id`
  - `payload.event_id`
- Extracts `event_type` from:
  - `payload.data.event_type`
  - `payload.event_type`
  - `payload.type`
- Extracts `resource_type` from:
  - `payload.data.record_type`
  - `payload.record_type`
- Extracts `resource_id` from:
  - `payload.data.payload.id`
  - `payload.resource_id`

Stored provider event shape:

```json
{
  "clinic_id": null,
  "provider": "telnyx",
  "provider_event_id": "test-telnyx-webhook-skeleton-001",
  "event_type": "message.received",
  "resource_type": "event",
  "resource_id": "fake-message-resource-001",
  "processing_status": "received",
  "payload": {
    "data": {
      "id": "test-telnyx-webhook-skeleton-001",
      "event_type": "message.received"
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
  "provider": "telnyx",
  "provider_event_id": "test-telnyx-webhook-skeleton-001",
  "event_type": "message.received"
}
```

## Local Validation Results

Local validation used a fake Telnyx-like `message.received` payload only.

Confirmed:

- Fake Telnyx `message.received` payload returned HTTP `200` with `status = "received"`.
- One `public.provider_events` row was created.
- Sending the same payload again returned HTTP `200` with `status = "duplicate"`.
- `provider_events` count for that `provider_event_id` stayed `1`.
- `reminders` count was unchanged.
- `messages` count was unchanged.
- `appointments` count was unchanged.
- No real Telnyx API call was made.
- No SMS was sent.
- No reminder/message/appointment business processing happened.

Example created local event:

```json
{
  "provider": "telnyx",
  "provider_event_id": "test-telnyx-webhook-skeleton-001",
  "event_type": "message.received",
  "resource_type": "event",
  "resource_id": "fake-message-resource-001",
  "processing_status": "received",
  "clinic_id": null
}
```

## Security And Production Limitations

The function is not production-ready.

Current limitations:

- No Telnyx signature verification yet.
- Payload fields are not trusted for business actions.
- `clinic_id` mapping is not implemented yet.
- Provider events are stored unmapped with `clinic_id = null`.
- Unmapped events are not visible to regular clinic users under current RLS.
- No provider secret should be exposed to frontend code.
- The function is not linked from UI.

Before production use, the webhook boundary needs Telnyx signature verification and a clear mapping strategy for clinic, message, reminder, and patient context.

## Known Limitations

- No event processing.
- No inbound patient response mapping.
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

1. Add a Vapi webhook skeleton using the same raw `provider_events` storage pattern.
2. Or add Telnyx inbound message mapping only after signature verification and clinic/reminder mapping strategy are explicit.
3. Later, define a provider event processing and idempotency strategy before mutating `messages`, `reminders`, `appointments`, or `call_logs`.

The safest next implementation slice is a Vapi raw-event capture skeleton, because it exercises the same provider boundary without prematurely processing patient responses.

## What Not To Do Next

- Do not send real SMS yet.
- Do not process patient responses directly from raw webhook payloads before signature verification.
- Do not update reminders/messages/appointments from Telnyx webhooks until mapping rules are explicit.
- Do not expose service-role credentials or provider secrets to frontend code.
- Do not make the provider events debug UI public.
- Do not connect full Telnyx/Vapi production behavior before event storage, signature, and idempotency boundaries are clear.
