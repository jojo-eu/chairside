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
END $$;
