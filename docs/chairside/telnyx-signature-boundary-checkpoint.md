# Chairside Telnyx Signature Boundary Checkpoint

This checkpoint summarizes the current signature verification boundary in the `telnyx-webhook` Edge Function.

## Purpose

The Telnyx signature boundary exists to make the webhook ingestion path explicit and safe before production provider traffic is enabled.

It is intended to:

- Add a security boundary for Telnyx webhook ingestion.
- Prevent Chairside from pretending webhook verification is production-ready.
- Keep local fake/test webhook validation working while provider integration is still staged.
- Preserve the raw request body needed for future exact signature verification.

This checkpoint covers the boundary only. It does not add business processing, SMS sending, reminder updates, message updates, appointment updates, or call log updates.

## Current Behavior

`telnyx-webhook` now reads the raw request body before JSON parsing. This preserves the original request body string for future signature verification, where the exact raw payload matters.

The function reads `TELNYX_WEBHOOK_SIGNING_SECRET` from the Edge Function environment.

When `TELNYX_WEBHOOK_SIGNING_SECRET` is not configured:

- Local/test requests are allowed.
- The provider event storage path still runs.
- The response includes:

```json
{
  "signature_verification": {
    "required": false,
    "skipped": true,
    "reason": "missing_signing_secret"
  }
}
```

When `TELNYX_WEBHOOK_SIGNING_SECRET` is configured:

- Telnyx-like signature headers are required.
- Missing signature headers return HTTP `401` with code `telnyx_signature_missing`.
- Present signature headers currently return HTTP `501` with code `telnyx_signature_verification_not_implemented`.
- This is intentional fail-closed behavior until exact Telnyx verification is implemented and tested against Telnyx documentation.

The function currently reads signature header candidates, but does not trust them yet. Header candidates include Telnyx-style signature and timestamp headers. No secret values are logged or returned.

## Local Validation Results

Local validation used fake Telnyx-like payloads only, with no `TELNYX_WEBHOOK_SIGNING_SECRET` configured.

Confirmed:

- A fake Telnyx payload returned HTTP `200` with `status = "received"`.
- The response included `signature_verification.reason = "missing_signing_secret"`.
- Sending the same payload again returned HTTP `200` with `status = "duplicate"`.
- Deduplication still worked through `unique(provider, provider_event_id)`.
- The provider event count for the repeated `provider_event_id` stayed `1`.
- No real Telnyx API calls were made.
- No SMS was sent.
- No `reminders` rows were updated.
- No `messages` rows were updated.
- No `appointments` rows were updated.
- No `call_logs` rows were updated.

Example local response shape without a signing secret:

```json
{
  "status": "received",
  "provider_event": {
    "provider": "telnyx",
    "provider_event_id": "test-telnyx-signature-boundary-001",
    "event_type": "message.received",
    "processing_status": "received",
    "clinic_id": null
  },
  "signature_verification": {
    "required": false,
    "skipped": true,
    "reason": "missing_signing_secret"
  }
}
```

Example duplicate response shape without a signing secret:

```json
{
  "status": "duplicate",
  "provider": "telnyx",
  "provider_event_id": "test-telnyx-signature-boundary-001",
  "event_type": "message.received",
  "signature_verification": {
    "required": false,
    "skipped": true,
    "reason": "missing_signing_secret"
  }
}
```

## Production Limitations

The exact Telnyx signature algorithm is not implemented yet.

Production constraints:

- No real `TELNYX_WEBHOOK_SIGNING_SECRET` should be committed.
- No provider secret should be stored in frontend code.
- No production Telnyx webhook should be enabled until verification is implemented against Telnyx docs and tested.
- The current behavior deliberately fails closed when a signing secret is configured.
- Payload fields are still untrusted for business processing.
- `clinic_id` mapping is not implemented yet.

This means the current function is suitable for local raw-event storage tests, but not production Telnyx webhook traffic.

## Known Implementation Notes

- Raw request body is preserved before JSON parsing for future signature verification.
- Signature header candidates are read, but not trusted yet.
- If no signing secret is configured, the function logs a server-side warning and allows local/test storage.
- If a signing secret is configured, unsigned requests fail with `401`.
- If a signing secret is configured and signature headers are present, the function fails with `501` until exact verification is implemented.
- No secrets are logged.
- No secrets are exposed to frontend code.
- Provider event storage remains raw-event-only.
- Stored Telnyx provider events still use `clinic_id = null` until mapping is implemented.

## Recommended Next Phase

Recommended next steps:

1. Implement exact Telnyx signature verification against Telnyx documentation.
2. Add local tests using fake deterministic signing inputs if possible.
3. Keep the webhook raw-event-only until signature verification is complete.
4. After verification, define clinic mapping for Telnyx events.
5. Only then map Telnyx events to reminder/message business state.
6. Consider a Vapi shared-secret or signature boundary next.

The safest next implementation slice is exact verification plus tests, not business mutation.

## What Not To Do Next

- Do not process real Telnyx webhooks before signature verification is complete.
- Do not send real SMS yet.
- Do not update reminders, messages, appointments, or call logs from raw Telnyx webhook payloads.
- Do not map patient responses from Telnyx before signature verification and clinic/reminder/message mapping.
- Do not expose provider secrets to frontend code.
- Do not commit real signing secrets.
- Do not make webhook debug endpoints public UI.
