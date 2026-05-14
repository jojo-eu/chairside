# Chairside Vapi Auth Boundary Checkpoint

This checkpoint summarizes the current authentication and signature boundary in the `vapi-webhook` Edge Function.

## Purpose

The Vapi auth boundary exists to make webhook ingestion explicit before real provider traffic is enabled.

It is intended to:

- Add a security boundary for Vapi webhook ingestion.
- Keep local fake/test webhook validation working.
- Prevent Chairside from pretending provider verification is production-ready.
- Preserve the raw request body needed for future HMAC-style verification.

This checkpoint covers the boundary only. It does not add business processing, call log updates, booking behavior, reminder updates, message updates, appointment updates, SMS sending, or Vapi API calls.

## Current Behavior

`vapi-webhook` reads the raw request body before JSON parsing. This preserves the original request body string for future HMAC verification, where the exact raw payload matters.

The function reads these environment variables when configured:

- `VAPI_WEBHOOK_SIGNING_SECRET`
- `VAPI_WEBHOOK_BEARER_TOKEN`
- `VAPI_WEBHOOK_SECRET`

Auth mode precedence is strict:

1. `VAPI_WEBHOOK_SIGNING_SECRET`
2. `VAPI_WEBHOOK_BEARER_TOKEN`
3. `VAPI_WEBHOOK_SECRET`

This means a stronger configured boundary is not bypassed by a weaker one.

When no Vapi auth environment variable is configured:

- Local/test requests are allowed.
- The provider event storage path still runs.
- The response includes:

```json
{
  "auth_verification": {
    "required": false,
    "skipped": true,
    "mode": "none",
    "reason": "missing_vapi_webhook_auth"
  }
}
```

When `VAPI_WEBHOOK_BEARER_TOKEN` is configured:

- The function requires `Authorization: Bearer <token>`.
- Missing or wrong tokens return HTTP `401` with code `vapi_bearer_token_invalid`.
- A correct exact match allows the raw provider event storage path to run.

When `VAPI_WEBHOOK_SECRET` is configured:

- The function requires an exact `X-Vapi-Secret` match.
- Missing or wrong secrets return HTTP `401` with code `vapi_shared_secret_invalid`.
- A correct exact match allows the raw provider event storage path to run.

When `VAPI_WEBHOOK_SIGNING_SECRET` is configured:

- Signature and timestamp headers are required.
- Missing headers return HTTP `401` with code `vapi_signature_missing`.
- Present headers currently return HTTP `501` with code `vapi_signature_verification_not_implemented`.
- This is intentional fail-closed behavior until exact Vapi HMAC verification is implemented and tested against the chosen Vapi configuration.

## Local Validation Results

Local validation used fake Vapi-like payloads only, with no Vapi auth environment variables configured.

Confirmed:

- A fake Vapi payload returned HTTP `200` with `status = "received"`.
- The response included `auth_verification.reason = "missing_vapi_webhook_auth"`.
- The response included `auth_verification.required = false`.
- The response included `auth_verification.skipped = true`.
- The response included `auth_verification.mode = "none"`.
- Sending the same payload again returned HTTP `200` with `status = "duplicate"`.
- Deduplication still worked through `unique(provider, provider_event_id)`.
- The provider event count for the repeated `provider_event_id` stayed `1`.
- No real Vapi API calls were made.
- No `call_logs` rows were updated.
- No `reminders` rows were updated.
- No `messages` rows were updated.
- No `appointments` rows were updated.

Example local response shape without a configured Vapi auth mode:

```json
{
  "status": "received",
  "provider_event": {
    "provider": "vapi",
    "provider_event_id": "test-vapi-auth-boundary-001",
    "event_type": "call.ended",
    "resource_type": "call.ended",
    "resource_id": "fake-vapi-call-auth-001",
    "processing_status": "received",
    "clinic_id": null
  },
  "auth_verification": {
    "required": false,
    "skipped": true,
    "mode": "none",
    "reason": "missing_vapi_webhook_auth"
  }
}
```

Example duplicate response shape without a configured Vapi auth mode:

```json
{
  "status": "duplicate",
  "provider": "vapi",
  "provider_event_id": "test-vapi-auth-boundary-001",
  "event_type": "call.ended",
  "auth_verification": {
    "required": false,
    "skipped": true,
    "mode": "none",
    "reason": "missing_vapi_webhook_auth"
  }
}
```

## Production Limitations

The exact Vapi HMAC/signature algorithm is not implemented yet.

Production constraints:

- Bearer token mode is a simple exact-match boundary.
- Shared secret mode is a simple exact-match boundary.
- Signing secret mode deliberately fails closed until exact HMAC verification is implemented.
- No real Vapi secrets should be committed.
- No provider secret should be stored in frontend code.
- No production Vapi webhook should be enabled until the configured auth mode is confirmed and tested.
- Payload fields are still untrusted for business processing.
- `clinic_id` mapping is not implemented yet.

This means the current function is suitable for local raw-event storage tests and controlled auth-boundary testing, but not production Vapi business processing.

## Known Implementation Notes

- Raw request body is preserved before JSON parsing for future signature verification.
- `Authorization` headers are read for bearer-token mode.
- `X-Vapi-Secret` and `x-vapi-secret` headers are read for shared-secret mode.
- `X-Vapi-Signature`, `x-vapi-signature`, `X-Vapi-Timestamp`, and `x-vapi-timestamp` headers are read for signing-secret mode.
- Signature headers are not trusted yet because exact HMAC verification is not implemented.
- No secrets are logged.
- No secrets are exposed to frontend code.
- Provider event storage remains raw-event-only.
- Stored Vapi provider events still use `clinic_id = null` until mapping is implemented.

## Recommended Next Phase

Recommended next steps:

1. Keep provider auth documentation updated when the real Vapi provider mode is chosen.
2. Implement exact Vapi HMAC verification only after confirming Vapi docs and configured credentials.
3. Or use bearer/shared secret mode for a controlled non-public pilot if that boundary is explicitly accepted.
4. Keep the webhook raw-event-only until auth mode and clinic mapping are clear.
5. Only then map Vapi events to clinic and `call_logs` business state.

The safest next implementation slice is confirming the intended Vapi auth mode before adding business mutations.

## What Not To Do Next

- Do not process real Vapi calls before the auth mode is confirmed.
- Do not book appointments from Vapi webhooks yet.
- Do not update `call_logs`, reminders, messages, or appointments from raw Vapi webhook payloads.
- Do not expose provider secrets to frontend code.
- Do not commit real Vapi secrets.
- Do not make webhook debug endpoints public UI.
