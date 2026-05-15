# Chairside Provider Mapping Lookup Checkpoint

This checkpoint summarizes the current `lookup-provider-mapping` Edge Function.

## Purpose

`lookup-provider-mapping` is an internal provider identifier to clinic mapping lookup.

It exists to:

- Look up which Chairside clinic owns a provider identifier.
- Prepare future webhook mapping without guessing clinic identity from raw provider payloads.
- Keep provider mapping lookup separate from provider event storage and business processing.
- Validate the current `public.provider_mappings` RLS boundary through an authenticated function.

This function does not process provider events, update business tables, or call provider APIs.

## Current Function

Function name:

```text
lookup-provider-mapping
```

Current behavior:

- Accepts `POST` JSON.
- Authenticates the user through the existing Edge Function auth middleware pattern.
- Reads `public.provider_mappings` through a user-scoped Supabase client and RLS.
- Does not use the service-role/admin client.
- Validates `provider`.
- Validates `mapping_type`.
- Trims `provider_identifier`.
- Defaults `active_only` to `true`.
- Returns only the matching provider mapping if it is visible to the authenticated user.

Allowed `provider` values:

- `telnyx`
- `vapi`
- `system`
- `manual`

Allowed `mapping_type` values:

- `phone_number`
- `assistant_id`
- `account_id`
- `messaging_profile_id`
- `webhook_secret_id`
- `other`

## Request Shape

```json
{
  "provider": "telnyx",
  "mapping_type": "phone_number",
  "provider_identifier": "+421900000001",
  "active_only": true
}
```

Fields:

- `provider`: required provider key.
- `mapping_type`: required mapping type key.
- `provider_identifier`: required provider identifier, trimmed before lookup.
- `active_only`: optional boolean, defaults to `true`.

## Response Shape

Successful response:

```json
{
  "mapping": {
    "id": "provider-mapping-id",
    "clinic_id": "clinic-id",
    "provider": "telnyx",
    "mapping_type": "phone_number",
    "provider_identifier": "+421900000001",
    "label": "Test Telnyx SMS number",
    "active": true,
    "metadata": {
      "local_seed": true,
      "fake_provider": "telnyx",
      "purpose": "local_testing"
    }
  },
  "active_only": true
}
```

Returned mapping fields:

- `id`
- `clinic_id`
- `provider`
- `mapping_type`
- `provider_identifier`
- `label`
- `active`
- `metadata`

## Validation And Errors

Validation behavior:

- Invalid `provider` returns HTTP `400` with `code = "invalid_provider"`.
- Invalid `mapping_type` returns HTTP `400` with `code = "invalid_mapping_type"`.
- Empty `provider_identifier` returns HTTP `400` with `code = "invalid_provider_identifier"`.
- Invalid `active_only` returns HTTP `400` with `code = "invalid_active_only"`.
- Unknown or inaccessible mapping returns HTTP `404` with `code = "provider_mapping_not_found"`.

The `404` behavior intentionally does not distinguish between a mapping that does not exist and a mapping that exists but is not visible through RLS.

## RLS Behavior

The lookup is scoped to the authenticated user's clinic access.

The function creates a Supabase client using the caller's bearer token, then queries `public.provider_mappings`. Normal RLS rules apply:

- A user can only find mappings for clinics they belong to.
- Mappings for other clinics are not returned.
- This is an internal authenticated lookup, not a public webhook endpoint.

The function does not use the service-role/admin client, so it does not bypass clinic-scoped visibility.

## Secret-Handling Note

`webhook_secret_id` is a reference identifier only.

Rules:

- Do not store raw provider secrets in `public.provider_mappings`.
- Do not return raw provider secrets from this function.
- Do not expose provider secrets to frontend code.
- Real provider secrets belong in Edge Function environment variables or a secret manager.

The lookup returns provider identifiers and metadata only. Seeded `webhook_secret_id` values are fake local references, not secret values.

## Local Validation Results

Local validation confirmed:

- `telnyx` `phone_number` `+421900000001` returned HTTP `200` and mapped `clinic_id`.
- `vapi` `assistant_id` `test-vapi-assistant-katarina` returned HTTP `200` and mapped `clinic_id`.
- Unknown `telnyx` `phone_number` `+421999999999` returned HTTP `404`.
- No `provider_events` rows were mutated.
- No `provider_event_processing_attempts` rows were mutated.
- No `reminders` rows were mutated.
- No `messages` rows were mutated.
- No `appointments` rows were mutated.
- No `call_logs` rows were mutated.

Validation used fake local seed data only.

## Known Limitations

- The function is not used by webhook processors yet.
- It does not normalize phone numbers beyond trimming whitespace.
- It does not support public provider webhook access by itself.
- It does not map raw provider events automatically.
- It does not update `provider_events.clinic_id`.
- It does not create processing attempts.
- There is no admin write/config UI for mappings yet.
- There are no provider-specific normalization rules yet.

## Recommended Next Phase

Recommended next steps:

1. Add a mapping helper or processor skeleton that maps `provider_events` to `clinic_id` using `provider_mappings`.
2. Keep business side effects separate from mapping lookup.
3. Later add provider-specific normalization rules, especially for phone numbers.
4. Later decide whether mapping lookup should become a shared internal helper rather than a standalone test function.

The next implementation should still stop at mapping. Message, reminder, call log, appointment, or activity mutations should remain separate processor steps.

## What Not To Do Next

- Do not expose this lookup publicly without a provider auth boundary.
- Do not store raw secrets in `provider_mappings`.
- Do not process business state from mapping lookup alone.
- Do not mutate reminders, messages, appointments, call logs, or provider events from this lookup.
- Do not build a broad generic provider configuration UI yet.
- Do not bypass RLS for clinic-user lookup behavior.
