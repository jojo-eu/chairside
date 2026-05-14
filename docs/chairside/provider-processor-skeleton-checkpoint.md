# Chairside Provider Processor Skeleton Checkpoint

This checkpoint summarizes the current `process-provider-event` Edge Function skeleton.

## Purpose

`process-provider-event` is the first provider processor boundary for Chairside.

It exists to:

- Test the provider event audit layer.
- Test provider event processing idempotency.
- Exercise `provider_event_processing_attempts`.
- Mark provider events as intentionally ignored by a skeleton processor.
- Keep raw provider ingestion separate from future business side effects.

It does not perform real provider processing yet. It does not update reminders, messages, appointments, or call logs.

## Current Function

Function name:

```text
process-provider-event
```

Request:

```json
{
  "provider_event_id": "public.provider_events.id uuid",
  "processor": "manual-skeleton",
  "action": "classify-only"
}
```

Required fields:

- `provider_event_id`

Optional fields:

- `processor`, default `manual-skeleton`
- `action`, default `classify-only`

Current validation and access behavior:

- Authenticates the caller using the existing Supabase Auth middleware pattern.
- Loads the `provider_events` row through a user-scoped Supabase client and RLS.
- Rejects inaccessible provider events.
- Rejects invalid `provider_event_id` values.
- Rejects mapped-null events with `409` and code `unmapped_event` if such an event is loaded.
- Uses the admin client only for writes after access validation succeeds.

For normal clinic users, current RLS hides `provider_events.clinic_id = null` rows. In local validation, an unmapped event returned a safe `404 not accessible` before reaching the explicit `409 unmapped_event` guard.

## Current Processing Behavior

For a mapped, accessible provider event, the function:

1. Creates one `public.provider_event_processing_attempts` row:
   - `provider_event_id`
   - `clinic_id`
   - `processor`
   - `action`
   - `status = "started"`
   - `idempotency_key`
2. Builds the idempotency key:

```text
provider + ":" + provider_events.id + ":" + action
```

3. Classifies known Telnyx/Vapi event types without processing them.
4. Updates the attempt:
   - `status = "ignored"`
   - `finished_at = now()`
   - `result` JSON explaining this is a processor skeleton only
5. Updates the provider event:
   - `processing_status = "ignored"`
   - `processed_at = now()`
   - `error_message = null`
6. Returns the updated provider event and attempt.

Known event types currently classified as skeleton-known:

- Telnyx:
  - `message.sent`
  - `message.delivered`
  - `message.failed`
  - `message.received`
- Vapi:
  - `call.started`
  - `call.ended`
  - `call.failed`
  - `call.missed`

Known and unknown event types are both ignored for now. The classification is placeholder metadata only.

The function does not update:

- `reminders`
- `messages`
- `appointments`
- `call_logs`
- activity logs

## Duplicate And Idempotency Behavior

`public.provider_event_processing_attempts` has a partial unique index on non-null `idempotency_key`.

Current duplicate behavior:

- First call for the same `provider_event_id` and `action` creates one attempt.
- Repeating the same call returns HTTP `200` with `status = "duplicate"`.
- Duplicate calls return the existing attempt when it can be loaded.
- Duplicate calls do not create another processing attempt.
- Duplicate calls do not mutate business tables.

Local validation showed:

```text
attempt_count = 1
```

for a repeated call using the same provider event and action.

## Local Validation Results

Local validation used fake seeded provider event data only.

Confirmed:

- A mapped seeded Telnyx provider event was processed through the skeleton.
- The first call returned HTTP `200` with `status = "ignored"`.
- The created attempt changed from `started` to `ignored`.
- The attempt `result` contained:
  - `skeleton = true`
  - `classification = "known_ignored"`
  - `reason = "processor skeleton only"`
  - provider and event type metadata
- The provider event changed to `processing_status = "ignored"`.
- The provider event `processed_at` value was set.
- A second call with the same provider event and action returned HTTP `200` with `status = "duplicate"`.
- The attempt count for the idempotency key stayed `1`.
- The normal clinic user could not process an unmapped `clinic_id = null` event because RLS made it inaccessible.

Business table counts stayed unchanged during validation:

- `reminders`
- `messages`
- `appointments`
- `call_logs`

No real provider API calls were made and no SMS was sent.

## Known Limitations

- No Telnyx signature verification is done here.
- No Vapi signature verification or shared-secret verification is done here.
- No actual Telnyx business processing exists yet.
- No actual Vapi business processing exists yet.
- No reminder mutation exists yet.
- No message mutation exists yet.
- No appointment mutation exists yet.
- No `call_logs` mutation exists yet.
- No retry queue or scheduler exists yet.
- No transaction wrapper exists across attempt and provider event writes.
- No admin UI exists for unmapped provider events or unmapped attempts.
- Classification is placeholder-only.
- The skeleton marks events as `ignored`; future real processors may need different status semantics.

## Recommended Next Phase

Recommended sequence:

1. Add a Telnyx signature verification skeleton.
2. Define and implement clinic mapping strategy.
3. Add a Telnyx message status processor.
4. Add a Telnyx inbound response processor.
5. Add a Vapi `call_logs` processor later.
6. Consider a transaction/RPC helper before real side effects are introduced.

The next production-leaning work should focus on trust and mapping boundaries, not business mutation.

## What Not To Do Next

- Do not process raw provider events into business state before signature verification and mapping.
- Do not book appointments from provider webhooks.
- Do not update reminders, messages, or call logs without idempotency.
- Do not expose service-role credentials or provider secrets to frontend code.
- Do not make debug views public.
- Do not turn provider processors into a generic workflow automation system.
