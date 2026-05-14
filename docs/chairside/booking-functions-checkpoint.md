# Chairside Booking Functions Checkpoint

This checkpoint summarizes the current Chairside booking Edge Function state.

## Current Booking Function Scope

The current booking API surface contains two authenticated Supabase Edge Functions:

- `check-availability`
- `book-appointment`

These functions establish the first internal booking boundary for Chairside. They support checking available appointment slots and creating appointments for existing clinics, patients, and services. They do not yet implement idempotency, reminder creation, activity logging, public booking, or provider integrations.

The functions use Supabase Auth JWTs and user-scoped Supabase clients for validation reads. `book-appointment` then uses the service-role admin client only after clinic, patient, and service access have been validated through the user-scoped client and RLS.

## `check-availability` Request Shape

Method: `POST`

Authentication: Supabase Bearer token.

Body:

```json
{
  "clinic_id": "uuid",
  "service_id": "uuid",
  "date": "YYYY-MM-DD"
}
```

Required fields:

- `clinic_id`
- `service_id`
- `date`

Validation:

- Request body must be valid JSON.
- `date` must use `YYYY-MM-DD` format.
- Clinic must be visible to the caller through the user-scoped Supabase client and RLS.
- Service must belong to the clinic and be active.

## `check-availability` Response Shape

Successful responses return HTTP `200`.

Body:

```json
{
  "clinic_id": "uuid",
  "service_id": "uuid",
  "date": "YYYY-MM-DD",
  "timezone": "Europe/Bratislava",
  "slot_step_minutes": 15,
  "service_duration_minutes": 30,
  "buffer_minutes": 10,
  "slots": [
    {
      "starts_at": "2026-05-14T07:00:00.000Z",
      "ends_at": "2026-05-14T07:30:00.000Z"
    }
  ]
}
```

If the clinic is closed for the requested date, the function still returns HTTP `200` with the same response envelope and an empty `slots` array.

Errors use the shared error response shape:

```json
{
  "status": 400,
  "message": "Missing clinic_id, service_id, or date"
}
```

## `check-availability` Behavior

The function currently:

- Reads `clinics` for `id`, `timezone`, and `config`.
- Reads `services` for `id`, `clinic_id`, `duration_minutes`, `buffer_minutes`, and `active`.
- Reads `clinic_closures` for the requested clinic/date.
- Reads `appointments` that overlap the requested local date window.
- Respects `clinic_closures`; a closure produces no available slots.
- Excludes appointments with status `cancelled` or `no_show` from blocking availability.
- Uses the service `duration_minutes` to compute each returned `ends_at`.
- Uses the service `buffer_minutes` when testing conflicts, so the buffer blocks later candidate slots but is not included in the returned `ends_at`.
- Generates slots every 15 minutes.
- Uses the clinic timezone, falling back to `Europe/Bratislava`.
- Uses default working hours if clinic working-hours config is missing:
  - Monday-Friday: `08:00` to `16:00`
  - Saturday-Sunday: closed

The function computes generated slots on demand. Slots are not persisted.

## `book-appointment` Request Shape

Method: `POST`

Authentication: Supabase Bearer token.

Body:

```json
{
  "clinic_id": "uuid",
  "patient_id": "uuid",
  "service_id": "uuid",
  "starts_at": "2026-05-14T07:00:00.000Z",
  "source": "manual",
  "notes": "Optional internal note",
  "patient_notes": "Optional patient-facing note"
}
```

Required fields:

- `clinic_id`
- `patient_id`
- `service_id`
- `starts_at`
- `source`

Optional fields:

- `notes`
- `patient_notes`

Allowed `source` values:

- `manual`
- `ai_voice`
- `ai_sms`
- `imported`

## `book-appointment` Response Shape

Successful creation returns HTTP `201 Created`.

Body:

```json
{
  "appointment": {
    "id": "uuid",
    "clinic_id": "uuid",
    "patient_id": "uuid",
    "service_id": "uuid",
    "starts_at": "2026-05-14T07:00:00.000Z",
    "ends_at": "2026-05-14T07:30:00.000Z",
    "status": "scheduled",
    "source": "manual",
    "notes": "Optional internal note",
    "patient_notes": "Optional patient-facing note",
    "created_by": "auth-user-uuid"
  }
}
```

The actual `appointment` object is returned from `select("*")`, so it includes the columns present on the `appointments` table.

Errors use the shared error response shape:

```json
{
  "status": 409,
  "message": "Appointment overlaps an existing appointment",
  "code": "appointment_overlap"
}
```

## `book-appointment` Validation Steps

The function currently validates:

1. The request is authenticated with a valid Supabase JWT.
2. The authenticated user can be loaded through Supabase Auth.
3. The request body is valid JSON.
4. Required fields are present: `clinic_id`, `patient_id`, `service_id`, `starts_at`, and `source`.
5. `source` is one of `manual`, `ai_voice`, `ai_sms`, or `imported`.
6. `starts_at` parses as a valid timestamp.
7. The clinic is accessible through the user-scoped Supabase client and RLS.
8. The patient belongs to the clinic and is accessible through the user-scoped Supabase client and RLS.
9. The service belongs to the clinic, is accessible through the user-scoped Supabase client and RLS, and is active.
10. The clinic is not closed on the local date derived from `starts_at` and the clinic timezone.
11. `ends_at` is computed from `starts_at` plus the service `duration_minutes`.

After those checks, the function inserts an appointment with:

- `status: "scheduled"`
- the requested `source`
- optional `notes`
- optional `patient_notes`
- `created_by` set to the authenticated user's id when available

## Conflict Handling

The database exclusion constraint `appointments_no_overlap` is the final double-booking guard.

`book-appointment` maps overlap insert failures to:

- HTTP status: `409`
- Error code: `appointment_overlap`
- Message: `Appointment overlaps an existing appointment`

The function treats PostgreSQL exclusion-constraint errors with code `23P01`, messages mentioning `appointments_no_overlap`, or messages mentioning a conflicting exclusion constraint as appointment overlap conflicts.

## Local Validation Results

Local validation has confirmed:

- `check-availability` returned HTTP `200` with available slots for a seeded clinic, service, and date.
- `book-appointment` returned HTTP `201 Created` for a valid booking request.
- A duplicate same-slot booking returned HTTP `409` with code `appointment_overlap`.

No browser testing is required for this documentation checkpoint.

## Known Limitations

- No idempotency yet.
- No reminders are created after booking yet.
- No activity log entry is created after booking yet.
- No public booking flow exists yet.
- No Telegram, Vapi, Telnyx, or OpenClaw integration exists yet.
- Timezone handling is MVP/simple and should be hardened before production scheduling edge cases.
- `book-appointment` does not independently regenerate availability slots before insert; it relies on validation plus the database overlap constraint as the final guard.
- `check-availability` and `book-appointment` are not versioned in their function names yet.

## Recommended Next Phase

Recommended branch:

```text
codex/chairside-booking-test-ui
```

Recommended sequence:

1. Add a minimal internal booking test UI or integration harness for local/operator validation.
2. Add activity logging and reminder creation after successful booking.
3. Add controlled Telegram/Vapi integration only after the internal booking boundary is stable.

## What Not To Do Next

- Do not build a generic workflow engine UI.
- Do not introduce broad calendar integrations yet.
- Do not bypass the database overlap constraint.
- Do not expose the service role to the frontend.
- Do not call Vapi, Telnyx, OpenClaw, or provider SDKs directly from React.
- Do not add public booking before the internal booking path is stable.
- Do not run dependency upgrades or `npm audit fix` as part of this checkpoint.
- Do not create migrations, schema changes, seed changes, or new Edge Functions for this documentation checkpoint.
