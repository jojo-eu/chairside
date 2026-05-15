# Chairside Provider Event Clinic Mapping Checkpoint

This checkpoint summarizes the current `map-provider-event-clinic` Edge Function.

## Purpose

`map-provider-event-clinic` maps raw `public.provider_events` rows to a Chairside `clinic_id`.

It exists to:

- Map raw provider events to a Chairside clinic before business processing.
- Use `public.provider_mappings` instead of guessing clinic identity from raw payloads.
- Prepare future provider event processors to work with clinic-scoped provider events.
- Keep clinic mapping separate from reminder, message, appointment, and call-log side effects.

This function is a mapping boundary only. It does not perform provider business processing yet.

## Current Function

Function name:

```text
map-provider-event-clinic
```

Request inputs:

- `provider_event_id`: required UUID for `public.provider_events.id`.
- `mapping_hint`: optional object with `mapping_type` and `provider_identifier`.
- `dry_run`: optional boolean, defaults to `false`.

Current behavior:

- Accepts `POST` JSON.
- Authenticates the caller through the existing Edge Function auth middleware pattern.
- Acts as an authenticated/internal function.
- Uses the admin client to load `provider_events` because unmapped events have `clinic_id = null` and are intentionally hidden by normal clinic RLS.
- Uses the admin client to look up active `provider_mappings`.
- Returns summaries only.
- Does not expose the raw provider event payload by default.

Returned provider event summaries include:

- `id`
- `clinic_id`
- `provider`
- `provider_event_id`
- `event_type`
- `resource_type`
- `resource_id`
- `processing_status`
- `received_at`

## Mapping Candidate Strategy

The function builds ordered mapping candidates, then matches each candidate against active `public.provider_mappings` rows with:

```text
provider + mapping_type + provider_identifier + active = true
```

If an explicit `mapping_hint` is provided, it is used after validation:

- `mapping_hint.mapping_type`
- `mapping_hint.provider_identifier`

Telnyx candidate order:

1. `payload.data.payload.to` as `phone_number`
2. `payload.data.payload.from` as `phone_number`
3. `payload.data.payload.messaging_profile_id` as `messaging_profile_id`

Vapi candidate order:

1. `payload.message.assistant.id` as `assistant_id`
2. `payload.assistant.id` as `assistant_id`
3. `payload.call.assistantId` as `assistant_id`
4. `payload.call.phoneNumber.number` as `phone_number`
5. `payload.phoneNumber.number` as `phone_number`
6. `payload.account.id` as `account_id`

Duplicate candidates are skipped within a single request.

## Current Behavior

Already mapped event:

- If `provider_events.clinic_id` is already set, the function returns `status = "already_mapped"`.
- It does not update the event.
- It returns `updated = false`.

Dry run:

- If `dry_run = true` and a mapping is found, the function returns the matched mapping and candidate.
- It does not update `provider_events`.
- It returns `updated = false`.

Non-dry run:

- If a mapping is found and `dry_run = false`, the function updates only `provider_events.clinic_id`.
- It returns `status = "mapped"`.
- It returns `updated = true`.

Intentionally unchanged:

- `provider_events.processing_status` is left unchanged.
- No `provider_event_processing_attempts` row is created.
- No `reminders` rows are mutated.
- No `messages` rows are mutated.
- No `appointments` rows are mutated.
- No `call_logs` rows are mutated.
- No provider APIs are called.
- No SMS is sent.

## Local Validation Results

Local validation used fake local provider events and fake local provider mappings only.

Telnyx validation confirmed:

- Created a fake Telnyx `provider_events` row through `telnyx-webhook`.
- The fake payload included `payload.data.payload.to = "+421900000001"`.
- `dry_run = true` matched the seeded Telnyx `phone_number` mapping.
- The matched candidate source was `payload.data.payload.to`.
- Dry run returned `updated = false`.
- A database check after dry run showed `clinic_id` was still `null`.
- Non-dry-run updated `provider_events.clinic_id`.
- The mapped `clinic_id` was the seeded clinic `deade4fe-787a-4644-b81b-334d30f12e21`.
- `processing_status` stayed `received`.
- Calling the function again for the same mapped event returned `status = "already_mapped"` with `updated = false`.

Additional local validation confirmed:

- A fake Vapi event with `payload.message.assistant.id = "test-vapi-assistant-katarina"` mapped through the seeded Vapi `assistant_id` mapping.
- An unknown Telnyx `phone_number` of `+421999999999` returned HTTP `404` with `code = "provider_mapping_not_found"`.
- The unknown event stayed unmapped with `clinic_id = null`.
- Counts for `reminders`, `messages`, `appointments`, `call_logs`, and `provider_event_processing_attempts` were unchanged before and after validation.

## Security Notes

This function is authenticated/internal.

Admin client usage is intentional and narrow:

- Unmapped raw `provider_events` have `clinic_id = null`.
- Normal clinic RLS hides those rows from regular clinic users.
- The function needs to inspect unmapped raw events to derive candidate mapping identifiers.
- The function returns provider event summaries and candidate metadata, not the full raw payload.

Security boundaries:

- Raw provider payload fields are used only for candidate derivation.
- Mapping an event to a clinic does not make the payload trusted for business logic.
- Provider signature or shared-secret verification is still required before production business processing.
- `provider_mappings` must not contain raw provider secrets.
- `webhook_secret_id` mappings are references only, not secret values.
- No service-role secrets are exposed to frontend code.

## Known Limitations

- This function does not enforce Telnyx signature verification itself.
- This function does not enforce Vapi auth/signature verification itself.
- Phone numbers are matched exactly after trimming; there is no provider-specific normalization yet.
- No processing attempt audit row is created here.
- No retry or scheduler exists for unmapped events.
- No provider event processor calls this mapping function yet.
- No business side effects are implemented.
- No admin UI exists for reviewing unmapped provider events.

## Recommended Next Phase

Recommended next steps:

1. Wire a processor step that maps `provider_events.clinic_id` before `classify-only`.
2. Keep business side effects separate from the mapping step.
3. Add provider-specific normalization rules, especially for phone numbers.
4. Add Telnyx message status processing only after signature verification and mapping rules are explicit.
5. Add Telnyx inbound response processing only after idempotency and reminder/message matching rules are explicit.
6. Add Vapi call-log processing later, after Vapi auth/mapping is stable.

The next useful processor slice is a mapping-before-classify step, not reminder/message/call-log mutation.

## What Not To Do Next

- Do not update reminders, messages, or call logs from raw payloads before signature verification and idempotent processor logic.
- Do not update appointments from raw provider events.
- Do not book appointments from raw Vapi webhook payloads.
- Do not expose provider payloads in public UI.
- Do not store raw provider secrets in `provider_mappings`.
- Do not treat clinic mapping as provider payload verification.
- Do not make provider event mapping a generic workflow engine.
