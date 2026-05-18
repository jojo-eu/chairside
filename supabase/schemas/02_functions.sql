--
-- Functions
-- This file declares all PL/pgSQL functions in the public schema.
--

CREATE OR REPLACE FUNCTION "public"."current_clinic_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" SECURITY DEFINER STABLE
    SET "search_path" TO 'public'
    AS $$
    select clinic_id
    from public.clinic_members
    where user_id = auth.uid();
$$;

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

CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_avatar_for_email"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(extensions.digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from extensions.http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_domain_favicon"("domain_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare domain_status int8;

begin
    if exists (select from favicons_excluded_domains as fav where fav.domain = domain_name) then
        return null;
    end if;

    return concat(
        'https://favicon.show/',
        (regexp_matches(domain_name, '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)', 'i'))[1]
    );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_note_attachments_function_url"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."handle_company_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare company_logo text;

begin
    if new.logo is not null then
        return new;
    end if;

    company_logo = get_domain_favicon(new.website);
    if company_logo is null then
        return new;
    end if;

    new.logo = concat('{"src":"', company_logo, '","title":"Company favicon"}');
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_note_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then FALSE else TRUE end
  );
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."lowercase_email_jsonb"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email_jsonb IS NOT NULL THEN
    NEW.email_jsonb = COALESCE((
      SELECT jsonb_agg(
        jsonb_set(elem, '{email}', to_jsonb(LOWER(elem->>'email')))
      )
      FROM jsonb_array_elements(NEW.email_jsonb) AS elem
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_sales_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sales_id IS NULL THEN
    SELECT id INTO NEW.sales_id FROM sales WHERE user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
