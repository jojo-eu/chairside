CREATE OR REPLACE FUNCTION "public"."resolve_inbound_response_accept_inbound"("p_inbound_message_id" "uuid", "p_expected_current_reminder_response_status" "text" DEFAULT NULL::"text", "p_staff_review_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_message record;
  v_reminder record;
  v_metadata jsonb;
  v_now timestamptz := now();
  v_parsed_response text;
  v_new_response_received_at timestamptz;
begin
  if v_actor_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    m.id,
    m.clinic_id,
    m.reminder_id,
    m.received_at,
    coalesce(m.metadata, '{}'::jsonb) as metadata
  into v_message
  from public.messages m
  where m.id = p_inbound_message_id
    and m.direction = 'inbound'
    and m.reminder_id is not null
    and m.clinic_id in (select public.current_clinic_ids())
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    r.id,
    r.clinic_id,
    r.status,
    r.response_status,
    r.response_received_at
  into v_reminder
  from public.reminders r
  where r.id = v_message.reminder_id
    and r.clinic_id = v_message.clinic_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'inbound_message', jsonb_build_object(
        'id', v_message.id,
        'clinic_id', v_message.clinic_id,
        'reminder_id', v_message.reminder_id
      )
    );
  end if;

  if v_message.metadata ->> 'staff_review_status' = 'resolved' then
    return jsonb_build_object(
      'status', 'already_resolved',
      'inbound_message', jsonb_build_object(
        'id', v_message.id,
        'clinic_id', v_message.clinic_id,
        'reminder_id', v_message.reminder_id
      ),
      'reminder', jsonb_build_object(
        'id', v_reminder.id,
        'previous_response_status', v_reminder.response_status,
        'response_status', v_reminder.response_status
      ),
      'staff_review_outcome', v_message.metadata ->> 'staff_review_outcome'
    );
  end if;

  if v_message.metadata ->> 'needs_staff_review' is distinct from 'true' then
    return jsonb_build_object(
      'status', 'not_found',
      'inbound_message', jsonb_build_object(
        'id', v_message.id,
        'clinic_id', v_message.clinic_id,
        'reminder_id', v_message.reminder_id
      )
    );
  end if;

  v_parsed_response := v_message.metadata ->> 'parsed_response';

  if v_parsed_response is null
    or v_parsed_response not in ('confirmed', 'declined', 'needs_review')
  then
    return jsonb_build_object(
      'status', 'invalid_parsed_response',
      'inbound_message', jsonb_build_object(
        'id', v_message.id,
        'clinic_id', v_message.clinic_id,
        'reminder_id', v_message.reminder_id
      ),
      'reminder', jsonb_build_object(
        'id', v_reminder.id,
        'previous_response_status', v_reminder.response_status,
        'response_status', v_reminder.response_status
      )
    );
  end if;

  if v_reminder.status = 'cancelled' then
    return jsonb_build_object(
      'status', 'cancelled_reminder',
      'inbound_message', jsonb_build_object(
        'id', v_message.id,
        'clinic_id', v_message.clinic_id,
        'reminder_id', v_message.reminder_id
      ),
      'reminder', jsonb_build_object(
        'id', v_reminder.id,
        'previous_response_status', v_reminder.response_status,
        'response_status', v_reminder.response_status
      )
    );
  end if;

  if p_expected_current_reminder_response_status is not null
    and v_reminder.response_status is distinct from p_expected_current_reminder_response_status
  then
    return jsonb_build_object(
      'status', 'stale_reminder_state',
      'inbound_message', jsonb_build_object(
        'id', v_message.id,
        'clinic_id', v_message.clinic_id,
        'reminder_id', v_message.reminder_id
      ),
      'reminder', jsonb_build_object(
        'id', v_reminder.id,
        'previous_response_status', v_reminder.response_status,
        'response_status', v_reminder.response_status
      )
    );
  end if;

  v_new_response_received_at := coalesce(v_message.received_at, v_now);

  update public.reminders
  set
    status = 'responded',
    response_status = v_parsed_response,
    response_received_at = v_new_response_received_at
  where id = v_reminder.id;

  v_metadata := v_message.metadata || jsonb_build_object(
    'staff_review_status', 'resolved',
    'staff_review_outcome', 'accept_inbound_response',
    'staff_reviewed_at', v_now,
    'staff_reviewed_by', v_actor_id,
    'previous_reminder_response_status', v_reminder.response_status,
    'new_reminder_response_status', v_parsed_response,
    'previous_reminder_response_received_at', v_reminder.response_received_at,
    'new_reminder_response_received_at', v_new_response_received_at
  );

  if p_staff_review_note is not null then
    v_metadata := v_metadata || jsonb_build_object(
      'staff_review_note', p_staff_review_note
    );
  end if;

  update public.messages
  set metadata = v_metadata
  where id = v_message.id
  returning metadata into v_metadata;

  return jsonb_build_object(
    'status', 'resolved',
    'inbound_message', jsonb_build_object(
      'id', v_message.id,
      'clinic_id', v_message.clinic_id,
      'reminder_id', v_message.reminder_id
    ),
    'reminder', jsonb_build_object(
      'id', v_reminder.id,
      'previous_response_status', v_reminder.response_status,
      'response_status', v_parsed_response
    ),
    'staff_review_outcome', v_metadata ->> 'staff_review_outcome'
  );
end;
$$;

revoke all on function public.resolve_inbound_response_accept_inbound(uuid, text, text) from public;
revoke all on function public.resolve_inbound_response_accept_inbound(uuid, text, text) from anon;
grant execute on function public.resolve_inbound_response_accept_inbound(uuid, text, text) to authenticated;
