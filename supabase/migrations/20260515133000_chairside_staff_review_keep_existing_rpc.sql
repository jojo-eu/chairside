CREATE OR REPLACE FUNCTION "public"."resolve_inbound_response_keep_existing"("p_inbound_message_id" "uuid", "p_expected_current_reminder_response_status" "text" DEFAULT NULL::"text", "p_staff_review_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_message record;
  v_reminder record;
  v_metadata jsonb;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    m.id,
    m.clinic_id,
    m.reminder_id,
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
    r.response_status
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
        'response_status', v_reminder.response_status
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
        'response_status', v_reminder.response_status
      ),
      'staff_review_outcome', v_message.metadata ->> 'staff_review_outcome'
    );
  end if;

  v_metadata := v_message.metadata || jsonb_build_object(
    'staff_review_status', 'resolved',
    'staff_review_outcome', 'keep_existing',
    'staff_reviewed_at', v_now,
    'staff_reviewed_by', v_actor_id,
    'previous_reminder_response_status', v_reminder.response_status,
    'new_reminder_response_status', v_reminder.response_status
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
      'response_status', v_reminder.response_status
    ),
    'staff_review_outcome', v_metadata ->> 'staff_review_outcome'
  );
end;
$$;

revoke all on function public.resolve_inbound_response_keep_existing(uuid, text, text) from public;
revoke all on function public.resolve_inbound_response_keep_existing(uuid, text, text) from anon;
grant execute on function public.resolve_inbound_response_keep_existing(uuid, text, text) to authenticated;
