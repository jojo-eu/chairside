# Chairside Provider Processor Auto Mapping Checkpoint

This checkpoint summarizes the current auto clinic mapping behavior in the `process-provider-event` Edge Function.

## Purpose

`process-provider-event` can now auto-map previously unmapped `public.provider_events` rows to `clinic_id`.

This exists to:

- Map provider events before classify-only skeleton processing.
- Let the processor skeleton handle raw provider events that were stored with `clinic_id = null`.
- Prepare future real provider processors while still avoiding business side effects.
- Keep clinic mapping, idempotency, and classify-only behavior explicit before reminder/message/call-log mutation exists.

This is still processor skeleton behavior only. It does not process real Telnyx or Vapi business state yet.

## Current Behavior

For provider events with `clinic_id` already set:

- Existing behavior is preserved.
- The function reads the event through the authenticated user's RLS-scoped Supabase client.
- It creates an idempotent classify-only processing attempt.
- It marks the attempt and provider event as ignored.

For provider events with `clinic_id = null`:

1. The normal RLS read returns no row because unmapped events are hidden from clinic users.
2. The function loads the raw provider event using the admin client.
3. It derives mapping candidates from the raw provider payload.
4. It searches for an active `public.provider_mappings` match.
5. It verifies the matched mapping is visible through the authenticated user's RLS context.
6. It updates only `provider_events.clinic_id`.
7. It continues into the existing classify-only skeleton path.

Important constraints:

- No raw payload is returned.
- No processing attempt is created until `clinic_id` is known.
- `provider_events.processing_status` is not changed during the mapping step itself.
- No business tables are mutated by mapping.
- No provider APIs are called.
- No SMS is sent.

If no mapping is found:

- The function returns a safe error with `code = "provider_mapping_not_found"`.
- It does not update `provider_events.clinic_id`.
- It does not create a processing attempt.
- It does not mutate business tables.

## Mapping Candidate Strategy

The processor uses the same candidate strategy as the dedicated `map-provider-event-clinic` mapping function.

Telnyx candidates:

1. `payload.data.payload.to` as `phone_number`
2. `payload.data.payload.from` as `phone_number`
3. `payload.data.payload.messaging_profile_id` as `messaging_profile_id`

Vapi candidates:

1. `payload.message.assistant.id` as `assistant_id`
2. `payload.assistant.id` as `assistant_id`
3. `payload.call.assistantId` as `assistant_id`
4. `payload.call.phoneNumber.number` as `phone_number`
5. `payload.phoneNumber.number` as `phone_number`
6. `payload.account.id` as `account_id`

Candidates are matched against active `public.provider_mappings` rows for the same provider.

## Processing Behavior After Mapping

After `clinic_id` is known, the existing classify-only processor behavior continues.

The function creates one `public.provider_event_processing_attempts` row with:

- `provider_event_id`
- `clinic_id`
- `processor`
- `action`
- `status = "started"`
- `started_at`
- `idempotency_key`

The idempotency key remains:

```text
provider + ":" + provider_events.id + ":" + action
```

Classify-only then:

- Updates the attempt to `status = "ignored"`.
- Sets `finished_at`.
- Stores skeleton result JSON.
- Updates `provider_events.processing_status = "ignored"`.
- Sets `provider_events.processed_at`.
- Clears `provider_events.error_message`.

Duplicate behavior is unchanged:

- Calling the same provider event with the same action again returns `status = "duplicate"`.
- The existing attempt is returned when available.
- No second processing attempt is created.
- Business tables remain untouched.

## Local Validation Results

Local validation used fake local provider events and fake local provider mappings only.

Confirmed Telnyx auto-mapping flow:

- Created a fake Telnyx provider event through `telnyx-webhook`.
- The fake payload included `payload.data.payload.to = "+421900000001"`.
- The initial provider event had `clinic_id = null`.
- Calling `process-provider-event` auto-mapped `clinic_id` through `provider_mappings`.
- The matched mapping was the seeded Telnyx `phone_number` mapping.
- The matched candidate source was `payload.data.payload.to`.
- Classify-only completed after mapping.
- The provider event `processing_status` became `ignored`.
- One `provider_event_processing_attempts` row was created.
- The attempt status became `ignored`.
- A second call returned `status = "duplicate"`.
- The attempt count stayed `1`.
- No `reminders` rows changed.
- No `messages` rows changed.
- No `appointments` rows changed.
- No `call_logs` rows changed.

Unknown mapping validation:

- A fake Telnyx event with `payload.data.payload.to = "+421999999999"` returned HTTP `404`.
- The error code was `provider_mapping_not_found`.
- The event remained `clinic_id = null`.
- The event remained `processing_status = "received"`.
- No processing attempt was created.

Business table counts stayed unchanged during validation:

- `reminders`
- `messages`
- `appointments`
- `call_logs`

## Security Notes

The function remains authenticated/internal.

Admin client usage is intentionally narrow:

- It is used only when the RLS-scoped read cannot see an unmapped event.
- Unmapped provider events have `clinic_id = null` and are hidden by normal clinic RLS.
- The admin-loaded raw payload is used only for candidate derivation.
- The raw payload is not returned to the caller.

The matched mapping is checked through the authenticated user's RLS-scoped Supabase client before the function writes `provider_events.clinic_id`. This prevents a normal clinic user from mapping an event into a clinic they cannot access.

Security boundaries:

- Auto-mapping does not make raw webhook payloads trusted for business logic.
- Provider signature/auth verification is still required before production provider processing.
- `provider_mappings` must not contain raw provider secrets.
- `webhook_secret_id` mappings remain references only, not secret values.
- No service-role secrets are exposed to frontend code.

## Known Limitations

- There is still no real provider business processing.
- The processor itself does not enforce Telnyx signature verification.
- The processor itself does not enforce Vapi auth or signature verification.
- Vapi auto-mapping was not part of this checkpoint's validation.
- Phone numbers are matched exactly after trimming; there is no provider-specific normalization yet.
- Mapping, attempt creation, and provider-event status update are not wrapped in a single DB transaction/RPC.
- There is no retry queue or scheduler.
- There is no admin UI for reviewing unmapped provider events.

## Recommended Next Phase

Recommended next steps:

1. Add Vapi auto-mapping validation with a fake assistant id payload if desired.
2. Consider a database RPC or transaction helper before real business side effects are introduced.
3. Begin a Telnyx message status processor skeleton only after signature, mapping, and idempotency rules are explicit.
4. Add Telnyx inbound response processing only after reminder/message matching rules are explicit.
5. Keep Vapi call-log processing staged behind Vapi auth and mapping validation.

The next production-leaning slice should still avoid broad business mutation until trust, mapping, and idempotency boundaries are all stable.

## What Not To Do Next

- Do not update reminders, messages, or call logs from raw payloads before signature/auth and idempotency strategy are complete.
- Do not update appointments from raw provider events.
- Do not book appointments from raw Vapi webhook payloads.
- Do not expose raw provider payloads publicly.
- Do not store raw provider secrets in `provider_mappings`.
- Do not treat auto-mapping as webhook verification.
- Do not turn provider processors into a generic workflow engine.
