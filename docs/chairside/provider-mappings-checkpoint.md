# Chairside Provider Mappings Checkpoint

This checkpoint summarizes the current `public.provider_mappings` foundation.

## Purpose

`public.provider_mappings` maps external provider identifiers to Chairside clinics.

It exists to:

- Map provider identifiers to Chairside clinics.
- Provide a future safe mapping layer for Telnyx and Vapi webhook processing.
- Prevent processors from guessing the clinic from raw webhook payloads.
- Keep provider-to-clinic mapping separate from raw event storage and business side effects.

The table is a mapping foundation only. No provider processor uses it yet.

## Current Database State

`public.provider_mappings` exists.

Columns include:

- `id`
- `clinic_id`
- `provider`
- `mapping_type`
- `provider_identifier`
- `label`
- `active`
- `metadata`
- `created_at`
- `updated_at`

Foreign key:

- `clinic_id` references `public.clinics(id)` with `on delete cascade`.

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

`provider_identifier` is plain text. `label` is optional display/context text. `active` defaults to `true`. `metadata` defaults to an empty JSON object.

## Uniqueness And Mapping Strategy

`public.provider_mappings` has:

```text
unique(provider, mapping_type, provider_identifier)
```

This means one provider identifier maps to only one clinic for a given provider and mapping type. For example, the same Vapi assistant id or Telnyx messaging profile id cannot be assigned to multiple clinics.

Mapping behavior:

- `provider` identifies the external/internal source.
- `mapping_type` identifies what kind of identifier is being mapped.
- `provider_identifier` stores the non-secret external identifier or reference.
- `clinic_id` identifies the Chairside clinic that owns the mapping.
- `active` supports disabling stale mappings without deleting historical context.
- `metadata` is for non-secret operational context only.

Future processors should map webhook events to a clinic through this table before mutating `messages`, `reminders`, `call_logs`, appointments, or activity logs.

## Secret-Handling Rules

Do not store raw provider secrets in `provider_mappings`.

Rules:

- `webhook_secret_id` is a reference or name only, not the secret value.
- Real provider secrets belong in Edge Function environment variables or a secret manager.
- No secrets should be stored in seed data.
- No secrets should be stored in documentation.
- No secrets should be exposed to frontend code.
- No secrets should be committed to the repository.

Provider mappings are identifiers and references, not credential storage.

## RLS Behavior

`provider_mappings` has RLS enabled.

Current policy:

- Authenticated clinic users can `SELECT` mappings where `clinic_id` is in `current_clinic_ids()`.

There are no authenticated write policies yet:

- No INSERT policy.
- No UPDATE policy.
- No DELETE policy.

Future admin/config UI can define safe write rules later. For now, normal clinic users get read visibility for their clinic mappings only.

## Current Seed Coverage

Local seed data includes six fake provider mappings for the seeded clinic `Zubná Praxma Bratislava`.

Seeded Telnyx mappings:

- Fake Telnyx `phone_number`: `+421900000001`
- Fake Telnyx `messaging_profile_id`: `test-telnyx-messaging-profile-chairside`
- Fake Telnyx `webhook_secret_id`: `test-telnyx-webhook-secret-ref-chairside`

Seeded Vapi mappings:

- Fake Vapi `assistant_id`: `test-vapi-assistant-katarina`
- Fake Vapi `phone_number`: `+421900000002`
- Fake Vapi `account_id`: `test-vapi-account-chairside`

All seeded rows:

- Use `active = true`.
- Use `metadata.local_seed = true`.
- Use `metadata.fake_provider = "telnyx"` or `"vapi"`.
- Use `metadata.purpose = "local_testing"`.
- Use fake identifiers only.
- Do not include real provider identifiers.
- Do not include secrets.

Repeatability:

- The seed deletes existing local seeded mappings for `Zubná Praxma Bratislava` where `metadata->>'local_seed' = 'true'`.
- The seed then reinserts the six fake mappings.

## Local Validation Results

Local validation confirmed:

- `provider_mappings` seed data applied locally.
- Six fake mappings were visible in a local database query.
- All six mappings had `active = true`.
- All six mappings had local seed metadata.
- No real provider data was used.
- No secret values were stored.

The seed was applied locally through the local Postgres container because this Supabase CLI version did not execute the multi-statement seed file through `supabase db query -f`.

## Known Limitations

- No UI for provider mappings yet.
- No processor uses `provider_mappings` yet.
- No admin write policies yet.
- No validation or normalization for phone number format yet.
- No real provider credential management yet.
- No provider-specific mapping fallback or conflict resolution behavior yet.
- No audit trail for mapping changes yet.

## Recommended Next Phase

Recommended next steps:

1. Add an internal/read-only debug view for `provider_mappings`.
2. Use `provider_mappings` in a provider event mapping skeleton.
3. Later add admin/config UI for managing mappings.
4. Later add provider-specific normalization rules, especially for phone numbers.
5. Later add safe audit/logging around mapping changes if write UI is introduced.

The next useful slice is a read-only internal debug page, because it validates visibility and RLS without processing real provider events.

## What Not To Do Next

- Do not store raw secrets in `provider_mappings`.
- Do not process real webhooks by guessing clinic identity from unmapped payloads.
- Do not expose provider mappings publicly.
- Do not add provider credentials to frontend code.
- Do not build a broad generic workflow/provider configuration UI yet.
- Do not mutate business state from provider webhooks until signature/auth verification and mapping are explicit.
