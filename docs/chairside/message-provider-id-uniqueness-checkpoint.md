# Chairside Message Provider ID Uniqueness Checkpoint

This checkpoint summarizes the current provider message id uniqueness guard on `public.messages`.

## Purpose

The uniqueness guard prevents duplicate provider message rows when a provider message id is present.

It exists to:

- Prepare safe inbound Telnyx `message.received` processing.
- Support idempotent provider webhook processing.
- Prevent duplicate inbound or outbound provider message records during retries.
- Keep manual, system, and local messages flexible when no provider id exists.

This guard does not implement inbound response processing by itself.

## Current Schema Guard

Current SQL object:

```sql
create unique index messages_provider_message_unique_idx
on public.messages using btree (provider, provider_message_id, direction)
where (provider_message_id is not null);
```

Details:

- Table: `public.messages`
- Index name: `messages_provider_message_unique_idx`
- Columns:
  - `provider`
  - `provider_message_id`
  - `direction`
- Predicate:
  - `provider_message_id is not null`

No RLS changes were required for this slice.

## Why Direction Is Included

`direction` is part of the unique key so inbound and outbound provider message records remain logically separate.

This means:

- A provider id cannot accidentally collide across inbound/outbound processing paths.
- Inbound and outbound message matching stays explicit.
- Future processors can query with `provider`, `provider_message_id`, and `direction` instead of relying on provider id alone.

The intended future matching shape is:

```text
provider + provider_message_id + direction
```

## Null Provider Message ID Behavior

`provider_message_id` remains nullable.

Rows with `provider_message_id = null` are not covered by the unique index, so Chairside can still store:

- Manual messages without provider ids.
- System/local test messages without provider ids.
- Internal placeholder messages before provider delivery exists.

Uniqueness applies only when `provider_message_id` is present.

## Safety Impact

The guard supports future provider processors by making duplicate provider message rows harder to create.

Safety impact:

- Duplicate webhook attempts cannot create duplicate provider message rows when processors check or insert by `provider_message_id`.
- Future Telnyx inbound `message.received` processing can use the same provider id boundary.
- Outbound status processing can continue matching existing provider messages explicitly.
- The index itself does not process provider events.
- The index itself does not update `reminders`, `messages`, `provider_events`, or processing attempts.

Processors still need to handle duplicate insert errors safely and return idempotent results.

## Current Limitations

- No Telnyx inbound `message.received` processor is implemented yet.
- Existing and future processors must still handle unique violations safely.
- No local migration/data cleanup was needed because current local data did not block index creation.
- There is no broad uniqueness across clinics.
- Provider message ids are assumed to be provider-global within `provider + direction`.

The current design intentionally avoids making `provider_message_id` required.

## Recommended Next Phase

Recommended next steps:

1. Implement a narrow Telnyx inbound `message.received` processor.
2. Only create an inbound message when reminder/message matching is safe.
3. Check for existing `provider + provider_message_id + direction` before inserting.
4. Handle duplicate provider message ids gracefully.
5. Keep reminder updates idempotent.

The processor should prefer ignored/no-op outcomes over unsafe matches.

## What Not To Do Next

- Do not create inbound messages without safe reminder/message matching.
- Do not infer a reminder from SMS text alone.
- Do not update multiple reminders.
- Do not process real Telnyx production traffic before signature verification is complete.
- Do not treat the uniqueness guard as a complete idempotency strategy by itself.
