INSERT INTO favicons_excluded_domains (domain) VALUES
    ('gmail.com'),
    ('yahoo.com'),
    ('hotmail.com'),
    ('aol.com'),
    ('hotmail.co.uk'),
    ('hotmail.fr'),
    ('msn.com'),
    ('yahoo.fr'),
    ('wanadoo.fr'),
    ('orange.fr'),
    ('comcast.net'),
    ('yahoo.co.uk'),
    ('yahoo.com.br'),
    ('yahoo.co.in'),
    ('live.com'),
    ('rediffmail.com'),
    ('free.fr'),
    ('gmx.de'),
    ('web.de'),
    ('yandex.ru'),
    ('ymail.com'),
    ('libero.it'),
    ('outlook.com'),
    ('uol.com.br'),
    ('bol.com.br'),
    ('mail.ru'),
    ('cox.net'),
    ('hotmail.it'),
    ('sbcglobal.net'),
    ('sfr.fr'),
    ('live.fr'),
    ('verizon.net'),
    ('live.co.uk'),
    ('googlemail.com'),
    ('yahoo.es'),
    ('ig.com.br'),
    ('live.nl'),
    ('bigpond.com'),
    ('terra.com.br'),
    ('yahoo.it'),
    ('neuf.fr'),
    ('yahoo.de'),
    ('alice.it'),
    ('rocketmail.com'),
    ('att.net'),
    ('laposte.net'),
    ('facebook.com'),
    ('bellsouth.net'),
    ('yahoo.in'),
    ('hotmail.es'),
    ('charter.net'),
    ('yahoo.ca'),
    ('yahoo.com.au'),
    ('rambler.ru'),
    ('hotmail.de'),
    ('tiscali.it'),
    ('shaw.ca'),
    ('yahoo.co.jp'),
    ('sky.com'),
    ('earthlink.net'),
    ('optonline.net'),
    ('freenet.de'),
    ('t-online.de'),
    ('aliceadsl.fr'),
    ('virgilio.it'),
    ('home.nl'),
    ('qq.com'),
    ('telenet.be'),
    ('me.com'),
    ('yahoo.com.ar'),
    ('tiscali.co.uk'),
    ('yahoo.com.mx'),
    ('voila.fr'),
    ('gmx.net'),
    ('mail.com'),
    ('planet.nl'),
    ('tin.it'),
    ('live.it'),
    ('ntlworld.com'),
    ('arcor.de'),
    ('yahoo.co.id'),
    ('frontiernet.net'),
    ('hetnet.nl'),
    ('live.com.au'),
    ('yahoo.com.sg'),
    ('zonnet.nl'),
    ('club-internet.fr'),
    ('juno.com'),
    ('optusnet.com.au'),
    ('blueyonder.co.uk'),
    ('bluewin.ch'),
    ('skynet.be'),
    ('sympatico.ca'),
    ('windstream.net'),
    ('mac.com'),
    ('centurytel.net'),
    ('chello.nl'),
    ('live.ca'),
    ('aim.com'),
    ('bigpond.net.au'),
    ('online.de'),
    ('apple.com');

-- Chairside local development seed data.
-- Fake/test data only. This is intended for local Supabase resets and demos, not production.
DO $$
DECLARE
    v_clinic_id uuid;
    v_patient_martin uuid;
    v_patient_lucia uuid;
    v_patient_petra uuid;
    v_patient_tomas uuid;
    v_patient_anna uuid;
    v_service_kontrola uuid;
    v_service_hygiena uuid;
    v_service_plomba uuid;
    v_service_extrakcia uuid;
    v_service_prevencia uuid;
    v_appointment_martin uuid;
    v_appointment_lucia uuid;
    v_appointment_petra uuid;
    v_appointment_tomas uuid;
    v_appointment_anna uuid;
    v_reminder_martin uuid;
    v_reminder_lucia uuid;
    v_reminder_petra uuid;
    v_reminder_tomas uuid;
    v_reminder_anna uuid;
BEGIN
    INSERT INTO public.clinics (
        name,
        slug,
        phone,
        email,
        address,
        timezone,
        language,
        config
    )
    VALUES (
        'Zubná Praxma Bratislava',
        'zubna-praxma-ba',
        '+421259054321',
        'recepcia@zubna-praxma.test',
        jsonb_build_object(
            'street', 'Karadžičova 12',
            'city', 'Bratislava',
            'postal_code', '82108',
            'country', 'SK'
        ),
        'Europe/Bratislava',
        'sk',
        jsonb_build_object(
            'working_hours', jsonb_build_object(
                'mon', jsonb_build_array(
                    jsonb_build_object('start', '08:00', 'end', '12:00'),
                    jsonb_build_object('start', '13:00', 'end', '17:00')
                ),
                'tue', jsonb_build_array(
                    jsonb_build_object('start', '08:00', 'end', '12:00'),
                    jsonb_build_object('start', '13:00', 'end', '17:00')
                ),
                'wed', jsonb_build_array(
                    jsonb_build_object('start', '08:00', 'end', '12:00'),
                    jsonb_build_object('start', '13:00', 'end', '17:00')
                ),
                'thu', jsonb_build_array(
                    jsonb_build_object('start', '08:00', 'end', '12:00'),
                    jsonb_build_object('start', '13:00', 'end', '17:00')
                ),
                'fri', jsonb_build_array(
                    jsonb_build_object('start', '08:00', 'end', '13:00')
                ),
                'sat', jsonb_build_array(),
                'sun', jsonb_build_array()
            ),
            'sms_templates', jsonb_build_object(
                'appointment_confirmation_24h',
                'Dobrý deň {{first_name}}, pripomíname Vám termín v {{clinic_name}} zajtra o {{time}}. Potvrďte prosím odpoveďou ÁNO alebo NIE.'
            ),
            'reminders', jsonb_build_object(
                'send_24h_before', true,
                'ask_for_confirmation', true
            )
        )
    )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        timezone = EXCLUDED.timezone,
        language = EXCLUDED.language,
        config = EXCLUDED.config,
        updated_at = now()
    RETURNING id INTO v_clinic_id;

    DELETE FROM public.messages WHERE clinic_id = v_clinic_id;
    DELETE FROM public.reminders WHERE clinic_id = v_clinic_id;
    DELETE FROM public.opt_outs WHERE clinic_id = v_clinic_id;
    DELETE FROM public.chairside_activity_log WHERE clinic_id = v_clinic_id;
    DELETE FROM public.call_logs WHERE clinic_id = v_clinic_id;
    DELETE FROM public.appointments WHERE clinic_id = v_clinic_id;
    DELETE FROM public.clinic_closures WHERE clinic_id = v_clinic_id;
    DELETE FROM public.services WHERE clinic_id = v_clinic_id;
    DELETE FROM public.patients WHERE clinic_id = v_clinic_id;

    INSERT INTO public.services (clinic_id, name, duration_minutes, buffer_minutes, color, display_order)
    VALUES
        (v_clinic_id, 'Kontrola', 30, 5, '#2563EB', 10),
        (v_clinic_id, 'Dentálna hygiena', 45, 10, '#059669', 20),
        (v_clinic_id, 'Plomba', 60, 10, '#D97706', 30),
        (v_clinic_id, 'Extrakcia', 30, 15, '#DC2626', 40),
        (v_clinic_id, 'Prevencia', 30, 5, '#7C3AED', 50);

    SELECT id INTO v_service_kontrola FROM public.services WHERE clinic_id = v_clinic_id AND name = 'Kontrola';
    SELECT id INTO v_service_hygiena FROM public.services WHERE clinic_id = v_clinic_id AND name = 'Dentálna hygiena';
    SELECT id INTO v_service_plomba FROM public.services WHERE clinic_id = v_clinic_id AND name = 'Plomba';
    SELECT id INTO v_service_extrakcia FROM public.services WHERE clinic_id = v_clinic_id AND name = 'Extrakcia';
    SELECT id INTO v_service_prevencia FROM public.services WHERE clinic_id = v_clinic_id AND name = 'Prevencia';

    INSERT INTO public.patients (
        clinic_id,
        first_name,
        last_name,
        phone,
        email,
        date_of_birth,
        language,
        notes,
        tags,
        last_visit_at,
        consent_given_at,
        consent_source,
        source
    )
    VALUES
        (v_clinic_id, 'Martin', 'Kováč', '+421905111222', 'martin.kovac@example.test', '1984-03-18', 'sk', 'Preferuje ranné termíny.', '["preventive"]'::jsonb, '2026-04-15 08:00:00+00', '2026-04-15 08:05:00+00', 'manual', 'manual'),
        (v_clinic_id, 'Lucia', 'Novotná', '+421917333444', 'lucia.novotna@example.test', '1991-07-09', 'sk', 'Citlivé ďasná.', '["hygiene"]'::jsonb, '2026-04-28 12:30:00+00', '2026-04-28 12:35:00+00', 'manual', 'manual'),
        (v_clinic_id, 'Petra', 'Horváthová', '+421948555666', 'petra.horvathova@example.test', '1978-11-24', 'sk', null, '[]'::jsonb, null, '2026-05-02 09:00:00+00', 'manual', 'manual'),
        (v_clinic_id, 'Tomáš', 'Svoboda', '+420606777888', 'tomas.svoboda@example.test', '1989-01-12', 'cs', 'Dochádza z Brna.', '["cz"]'::jsonb, '2026-03-20 10:00:00+00', '2026-03-20 10:10:00+00', 'manual', 'manual'),
        (v_clinic_id, 'Anna', 'Mrázová', '+421903222333', 'anna.mrazova@example.test', '1966-09-03', 'sk', 'Nekontaktovať pred 10:00.', '["follow_up"]'::jsonb, '2026-05-05 07:30:00+00', '2026-05-05 07:35:00+00', 'manual', 'manual');

    SELECT id INTO v_patient_martin FROM public.patients WHERE clinic_id = v_clinic_id AND phone = '+421905111222';
    SELECT id INTO v_patient_lucia FROM public.patients WHERE clinic_id = v_clinic_id AND phone = '+421917333444';
    SELECT id INTO v_patient_petra FROM public.patients WHERE clinic_id = v_clinic_id AND phone = '+421948555666';
    SELECT id INTO v_patient_tomas FROM public.patients WHERE clinic_id = v_clinic_id AND phone = '+420606777888';
    SELECT id INTO v_patient_anna FROM public.patients WHERE clinic_id = v_clinic_id AND phone = '+421903222333';

    INSERT INTO public.clinic_closures (clinic_id, date, reason)
    VALUES
        (v_clinic_id, '2026-05-29', 'Školenie tímu'),
        (v_clinic_id, '2026-07-06', 'Sviatok');

    INSERT INTO public.appointments (
        clinic_id,
        patient_id,
        service_id,
        starts_at,
        ends_at,
        status,
        source,
        confirmed_at,
        notes,
        patient_notes
    )
    VALUES
        (v_clinic_id, v_patient_martin, v_service_kontrola, '2026-05-20 07:00:00+00', '2026-05-20 07:30:00+00', 'confirmed', 'manual', '2026-05-19 08:10:00+00', 'Kontrolná prehliadka.', null),
        (v_clinic_id, v_patient_lucia, v_service_hygiena, '2026-05-20 08:00:00+00', '2026-05-20 08:45:00+00', 'scheduled', 'ai_voice', null, 'Vytvorené cez AI hovor.', 'Pacientka prosí jemný postup.'),
        (v_clinic_id, v_patient_petra, v_service_plomba, '2026-05-21 11:00:00+00', '2026-05-21 12:00:00+00', 'scheduled', 'manual', null, null, null),
        (v_clinic_id, v_patient_tomas, v_service_extrakcia, '2026-05-22 09:30:00+00', '2026-05-22 10:00:00+00', 'needs_reschedule', 'ai_voice', null, 'Pacient chce presunúť termín.', null),
        (v_clinic_id, v_patient_anna, v_service_prevencia, '2026-05-25 06:30:00+00', '2026-05-25 07:00:00+00', 'scheduled', 'imported', null, 'Importovaný testovací termín.', null);

    SELECT id INTO v_appointment_martin FROM public.appointments WHERE clinic_id = v_clinic_id AND patient_id = v_patient_martin AND starts_at = '2026-05-20 07:00:00+00';
    SELECT id INTO v_appointment_lucia FROM public.appointments WHERE clinic_id = v_clinic_id AND patient_id = v_patient_lucia AND starts_at = '2026-05-20 08:00:00+00';
    SELECT id INTO v_appointment_petra FROM public.appointments WHERE clinic_id = v_clinic_id AND patient_id = v_patient_petra AND starts_at = '2026-05-21 11:00:00+00';
    SELECT id INTO v_appointment_tomas FROM public.appointments WHERE clinic_id = v_clinic_id AND patient_id = v_patient_tomas AND starts_at = '2026-05-22 09:30:00+00';
    SELECT id INTO v_appointment_anna FROM public.appointments WHERE clinic_id = v_clinic_id AND patient_id = v_patient_anna AND starts_at = '2026-05-25 06:30:00+00';

    INSERT INTO public.call_logs (
        clinic_id,
        patient_id,
        appointment_id,
        direction,
        phone,
        provider,
        provider_call_id,
        status,
        outcome,
        started_at,
        ended_at,
        duration_seconds,
        transcript,
        summary,
        metadata,
        needs_review,
        created_at
    )
    VALUES
        (
            v_clinic_id,
            v_patient_lucia,
            v_appointment_lucia,
            'inbound',
            '+421917333444',
            'vapi',
            'test-call-lucia-booked',
            'completed',
            'booked',
            '2026-05-19 07:31:00+00',
            '2026-05-19 07:35:20+00',
            260,
            'Pacientka volá kvôli dentálnej hygiene. AI overila dostupnosť a ponúkla termín 20. mája o 10:00.',
            'AI recepcia rezervovala dentálnu hygienu pre Luciu Novotnú.',
            jsonb_build_object('local_seed', true, 'workflow_id', 'test-workflow-booking', 'language', 'sk'),
            false,
            '2026-05-19 07:35:20+00'
        ),
        (
            v_clinic_id,
            v_patient_tomas,
            v_appointment_tomas,
            'inbound',
            '+420606777888',
            'vapi',
            'test-call-tomas-reschedule',
            'completed',
            'needs_reschedule',
            '2026-05-19 09:01:00+00',
            '2026-05-19 09:05:10+00',
            250,
            'Pacient žiada presunúť termín extrakcie, ale nevie potvrdiť nový čas.',
            'Tomáš Svoboda potrebuje presunúť termín. Vyžaduje kontrolu recepcie.',
            jsonb_build_object('local_seed', true, 'workflow_id', 'test-workflow-reschedule', 'language', 'cs'),
            true,
            '2026-05-19 09:05:10+00'
        ),
        (
            v_clinic_id,
            null,
            null,
            'inbound',
            '+421902000111',
            'vapi',
            'test-call-unknown-missed',
            'missed',
            'unknown',
            '2026-05-19 11:12:00+00',
            null,
            null,
            null,
            'Zmeškaný testovací hovor z neznámeho čísla.',
            jsonb_build_object('local_seed', true, 'caller_known', false),
            true,
            '2026-05-19 11:12:00+00'
        ),
        (
            v_clinic_id,
            v_patient_anna,
            null,
            'outbound',
            '+421903222333',
            'vapi',
            'test-call-anna-failed',
            'failed',
            'failed',
            '2026-05-19 12:00:00+00',
            '2026-05-19 12:00:18+00',
            18,
            null,
            'Testovací odchádzajúci hovor zlyhal počas spojenia.',
            jsonb_build_object('local_seed', true, 'failure_reason', 'Test provider connection failure'),
            true,
            '2026-05-19 12:00:18+00'
        ),
        (
            v_clinic_id,
            v_patient_martin,
            null,
            'inbound',
            '+421905111222',
            'vapi',
            'test-call-martin-question',
            'completed',
            'answered_question',
            '2026-05-19 13:20:00+00',
            '2026-05-19 13:22:05+00',
            125,
            'Pacient sa pýta na parkovanie a ordinačné hodiny. AI poskytla informácie bez zmeny termínu.',
            'Martin Kováč dostal odpoveď na praktickú otázku, bez ďalšej akcie.',
            jsonb_build_object('local_seed', true, 'topic', 'opening_hours_and_parking'),
            false,
            '2026-05-19 13:22:05+00'
        ),
        (
            v_clinic_id,
            v_patient_petra,
            null,
            'inbound',
            '+421948555666',
            'vapi',
            'test-call-petra-no-action',
            'completed',
            'no_action',
            '2026-05-19 14:10:00+00',
            '2026-05-19 14:11:40+00',
            100,
            'Pacientka si overila adresu kliniky a rozhodla sa zavolať neskôr.',
            'Informačný hovor bez rezervácie alebo zmeny termínu.',
            jsonb_build_object('local_seed', true, 'topic', 'clinic_address'),
            false,
            '2026-05-19 14:11:40+00'
        );

    INSERT INTO public.reminders (
        clinic_id,
        appointment_id,
        patient_id,
        scheduled_for,
        sent_at,
        status,
        channel,
        template_key,
        response_status,
        response_received_at,
        created_at,
        updated_at
    )
    VALUES
        (v_clinic_id, v_appointment_martin, v_patient_martin, '2026-05-19 08:00:00+00', '2026-05-19 08:00:30+00', 'responded', 'sms', 'appointment_confirmation_24h', 'confirmed', '2026-05-19 08:10:00+00', '2026-05-19 07:55:00+00', '2026-05-19 08:10:00+00'),
        (v_clinic_id, v_appointment_lucia, v_patient_lucia, '2026-05-19 08:15:00+00', '2026-05-19 08:15:30+00', 'delivered', 'sms', 'appointment_confirmation_24h', null, null, '2026-05-19 08:05:00+00', '2026-05-19 08:16:00+00'),
        (v_clinic_id, v_appointment_petra, v_patient_petra, '2026-05-20 11:00:00+00', null, 'pending', 'sms', 'appointment_confirmation_24h', null, null, '2026-05-19 08:20:00+00', '2026-05-19 08:20:00+00'),
        (v_clinic_id, v_appointment_tomas, v_patient_tomas, '2026-05-21 09:30:00+00', '2026-05-21 09:30:45+00', 'responded', 'sms', 'appointment_confirmation_24h', 'needs_review', '2026-05-21 09:42:00+00', '2026-05-21 09:20:00+00', '2026-05-21 09:42:00+00'),
        (v_clinic_id, v_appointment_anna, v_patient_anna, '2026-05-24 06:30:00+00', '2026-05-24 06:31:00+00', 'failed', 'sms', 'appointment_confirmation_24h', null, null, '2026-05-24 06:20:00+00', '2026-05-24 06:31:00+00');

    SELECT id INTO v_reminder_martin FROM public.reminders WHERE clinic_id = v_clinic_id AND appointment_id = v_appointment_martin;
    SELECT id INTO v_reminder_lucia FROM public.reminders WHERE clinic_id = v_clinic_id AND appointment_id = v_appointment_lucia;
    SELECT id INTO v_reminder_petra FROM public.reminders WHERE clinic_id = v_clinic_id AND appointment_id = v_appointment_petra;
    SELECT id INTO v_reminder_tomas FROM public.reminders WHERE clinic_id = v_clinic_id AND appointment_id = v_appointment_tomas;
    SELECT id INTO v_reminder_anna FROM public.reminders WHERE clinic_id = v_clinic_id AND appointment_id = v_appointment_anna;

    INSERT INTO public.messages (
        clinic_id,
        patient_id,
        appointment_id,
        reminder_id,
        direction,
        channel,
        provider,
        provider_message_id,
        body,
        status,
        sent_at,
        received_at,
        metadata,
        created_at
    )
    VALUES
        (v_clinic_id, v_patient_martin, v_appointment_martin, v_reminder_martin, 'outbound', 'sms', 'telnyx', 'test-msg-martin-outbound', 'Dobrý deň Martin, pripomíname Vám termín v Zubná Praxma Bratislava zajtra o 09:00. Potvrďte prosím odpoveďou ÁNO alebo NIE.', 'delivered', '2026-05-19 08:00:30+00', null, jsonb_build_object('local_seed', true, 'template_key', 'appointment_confirmation_24h'), '2026-05-19 08:00:30+00'),
        (v_clinic_id, v_patient_martin, v_appointment_martin, v_reminder_martin, 'inbound', 'sms', 'telnyx', 'test-msg-martin-inbound', 'ÁNO', 'received', null, '2026-05-19 08:10:00+00', jsonb_build_object('local_seed', true, 'parsed_response', 'confirmed'), '2026-05-19 08:10:00+00'),
        (v_clinic_id, v_patient_lucia, v_appointment_lucia, v_reminder_lucia, 'outbound', 'sms', 'telnyx', 'test-msg-lucia-outbound', 'Dobrý deň Lucia, pripomíname Vám termín v Zubná Praxma Bratislava zajtra o 10:00. Potvrďte prosím odpoveďou ÁNO alebo NIE.', 'delivered', '2026-05-19 08:15:30+00', null, jsonb_build_object('local_seed', true, 'template_key', 'appointment_confirmation_24h'), '2026-05-19 08:15:30+00'),
        (v_clinic_id, v_patient_petra, v_appointment_petra, v_reminder_petra, 'outbound', 'sms', 'system', 'test-msg-petra-queued', 'Dobrý deň Petra, pripomíname Vám termín v Zubná Praxma Bratislava zajtra o 13:00. Potvrďte prosím odpoveďou ÁNO alebo NIE.', 'queued', null, null, jsonb_build_object('local_seed', true, 'template_key', 'appointment_confirmation_24h'), '2026-05-20 10:55:00+00'),
        (v_clinic_id, v_patient_tomas, v_appointment_tomas, v_reminder_tomas, 'outbound', 'sms', 'telnyx', 'test-msg-tomas-outbound', 'Dobrý deň Tomáš, pripomíname Vám termín v Zubná Praxma Bratislava zajtra o 11:30. Potvrďte prosím odpoveďou ÁNO alebo NIE.', 'sent', '2026-05-21 09:30:45+00', null, jsonb_build_object('local_seed', true, 'template_key', 'appointment_confirmation_24h'), '2026-05-21 09:30:45+00'),
        (v_clinic_id, v_patient_tomas, v_appointment_tomas, v_reminder_tomas, 'inbound', 'sms', 'telnyx', 'test-msg-tomas-inbound', 'NIE, prosím iný termín', 'received', null, '2026-05-21 09:42:00+00', jsonb_build_object('local_seed', true, 'parsed_response', 'needs_review'), '2026-05-21 09:42:00+00'),
        (v_clinic_id, v_patient_anna, v_appointment_anna, v_reminder_anna, 'outbound', 'sms', 'telnyx', 'test-msg-anna-failed', 'Dobrý deň Anna, pripomíname Vám termín v Zubná Praxma Bratislava zajtra o 08:30. Potvrďte prosím odpoveďou ÁNO alebo NIE.', 'failed', '2026-05-24 06:31:00+00', null, jsonb_build_object('local_seed', true, 'failure_reason', 'Test provider failure'), '2026-05-24 06:31:00+00');

    INSERT INTO public.opt_outs (
        clinic_id,
        patient_id,
        phone,
        channel,
        reason,
        created_at
    )
    VALUES
        (v_clinic_id, v_patient_tomas, '+420606777888', 'sms', 'Local test opt-out row for future UI testing.', '2026-05-21 09:45:00+00');

    INSERT INTO public.chairside_activity_log (
        clinic_id,
        actor_type,
        actor_id,
        actor_label,
        action,
        entity_type,
        entity_id,
        details,
        created_at
    )
    VALUES
        (
            v_clinic_id,
            'ai',
            null,
            'AI recepcia',
            'appointment.created',
            'appointment',
            v_appointment_lucia,
            jsonb_build_object(
                'patient_name', 'Lucia Novotná',
                'service_name', 'Dentálna hygiena',
                'starts_at', '2026-05-20T08:00:00Z',
                'source', 'ai_voice'
            ),
            '2026-05-19 07:35:00+00'
        ),
        (
            v_clinic_id,
            'system',
            null,
            'Systém pripomienok',
            'reminder.sent',
            'reminder',
            null,
            jsonb_build_object(
                'patient_name', 'Martin Kováč',
                'appointment_id', v_appointment_martin,
                'channel', 'sms',
                'template', 'appointment_confirmation_24h'
            ),
            '2026-05-19 08:00:00+00'
        ),
        (
            v_clinic_id,
            'patient',
            v_patient_martin,
            'Martin Kováč',
            'appointment.confirmed',
            'appointment',
            v_appointment_martin,
            jsonb_build_object(
                'response', 'ÁNO',
                'channel', 'sms',
                'confirmed_at', '2026-05-19T08:10:00Z'
            ),
            '2026-05-19 08:10:00+00'
        ),
        (
            v_clinic_id,
            'user',
            null,
            'Local Tester',
            'patient.created',
            'patient',
            v_patient_petra,
            jsonb_build_object(
                'patient_name', 'Petra Horváthová',
                'source', 'manual'
            ),
            '2026-05-19 08:25:00+00'
        ),
        (
            v_clinic_id,
            'ai',
            null,
            'AI recepcia',
            'appointment.needs_reschedule',
            'appointment',
            v_appointment_tomas,
            jsonb_build_object(
                'patient_name', 'Tomáš Svoboda',
                'service_name', 'Extrakcia',
                'reason', 'Pacient chce presunúť termín.'
            ),
            '2026-05-19 09:05:00+00'
        ),
        (
            v_clinic_id,
            'user',
            null,
            'Local Tester',
            'service.updated',
            'service',
            v_service_hygiena,
            jsonb_build_object(
                'service_name', 'Dentálna hygiena',
                'duration_minutes', 45,
                'buffer_minutes', 10
            ),
            '2026-05-19 09:30:00+00'
        ),
        (
            v_clinic_id,
            'system',
            null,
            'Import',
            'appointment.created',
            'appointment',
            v_appointment_anna,
            jsonb_build_object(
                'patient_name', 'Anna Mrázová',
                'service_name', 'Prevencia',
                'source', 'imported'
            ),
            '2026-05-19 10:00:00+00'
        ),
        (
            v_clinic_id,
            'user',
            null,
            'Local Tester',
            'patient.updated',
            'patient',
            v_patient_martin,
            jsonb_build_object(
                'patient_name', 'Martin Kováč',
                'changed_field', 'notes',
                'summary', 'Doplnená preferencia ranných termínov.'
            ),
            '2026-05-19 10:20:00+00'
        );
END $$;
