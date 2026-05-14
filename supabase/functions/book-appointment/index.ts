import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

type BookAppointmentRequest = {
  clinic_id?: string;
  patient_id?: string;
  service_id?: string;
  starts_at?: string;
  source?: AppointmentSource;
  notes?: string | null;
  patient_notes?: string | null;
};

type AppointmentSource = "manual" | "ai_voice" | "ai_sms" | "imported";
type ActivityActorType = "user" | "ai" | "system";

type Clinic = {
  id: string;
  timezone: string | null;
};

type Service = {
  id: string;
  clinic_id: string;
  duration_minutes: number;
  active: boolean;
};

type Patient = {
  id: string;
  clinic_id: string;
};

const DEFAULT_TIMEZONE = "Europe/Bratislava";
const REMINDER_LEAD_TIME_MINUTES = 24 * 60;
const appointmentSources = new Set<AppointmentSource>([
  "manual",
  "ai_voice",
  "ai_sms",
  "imported",
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function getReminderScheduledFor(startsAt: Date, now = new Date()) {
  const scheduledFor = addMinutes(startsAt, -REMINDER_LEAD_TIME_MINUTES);

  return scheduledFor < now ? now : scheduledFor;
}

function parseStartsAt(startsAt: string) {
  const parsed = new Date(startsAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function dateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isOverlapError(error: { code?: string; message?: string }) {
  return error.code === "23P01" ||
    error.message?.includes("appointments_no_overlap") === true ||
    error.message?.includes("conflicting key value violates exclusion constraint") ===
      true;
}

function getActivityActor(
  source: AppointmentSource,
  user?: { id: string; email?: string },
) {
  if (source === "manual") {
    return {
      actor_type: "user" as ActivityActorType,
      actor_id: user?.id ?? null,
      actor_label: user?.email ?? "Používateľ",
    };
  }

  if (source === "imported") {
    return {
      actor_type: "system" as ActivityActorType,
      actor_id: null,
      actor_label: "Import",
    };
  }

  return {
    actor_type: "ai" as ActivityActorType,
    actor_id: null,
    actor_label: "AI recepcia",
  };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let payload: BookAppointmentRequest;
        try {
          payload = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body");
        }

        const {
          clinic_id,
          patient_id,
          service_id,
          starts_at,
          source,
          notes = null,
          patient_notes = null,
        } = payload;

        if (!clinic_id || !patient_id || !service_id || !starts_at || !source) {
          return createErrorResponse(
            400,
            "Missing clinic_id, patient_id, service_id, starts_at, or source",
          );
        }
        if (!appointmentSources.has(source)) {
          return createErrorResponse(400, "Invalid appointment source");
        }

        const startsAt = parseStartsAt(starts_at);
        if (!startsAt) {
          return createErrorResponse(400, "starts_at must be a valid timestamp");
        }

        const authHeader = req.headers.get("Authorization") ?? "";
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );

        const { data: clinic, error: clinicError } = await supabase
          .from("clinics")
          .select("id, timezone")
          .eq("id", clinic_id)
          .single<Clinic>();

        if (clinicError || !clinic) {
          return createErrorResponse(404, "Clinic not found or not accessible");
        }

        const { data: patient, error: patientError } = await supabase
          .from("patients")
          .select("id, clinic_id")
          .eq("id", patient_id)
          .eq("clinic_id", clinic_id)
          .single<Patient>();

        if (patientError || !patient) {
          return createErrorResponse(404, "Patient not found or not accessible");
        }

        const { data: service, error: serviceError } = await supabase
          .from("services")
          .select("id, clinic_id, duration_minutes, active")
          .eq("id", service_id)
          .eq("clinic_id", clinic_id)
          .single<Service>();

        if (serviceError || !service) {
          return createErrorResponse(404, "Service not found or not accessible");
        }
        if (!service.active) {
          return createErrorResponse(400, "Service is not active");
        }

        const timezone = clinic.timezone || DEFAULT_TIMEZONE;
        const localDate = dateInTimezone(startsAt, timezone);
        const { data: closures, error: closuresError } = await supabase
          .from("clinic_closures")
          .select("id")
          .eq("clinic_id", clinic_id)
          .eq("date", localDate);

        if (closuresError) {
          return createErrorResponse(500, "Failed to load clinic closures");
        }
        if ((closures?.length ?? 0) > 0) {
          return createErrorResponse(409, "Clinic is closed on this date");
        }

        const endsAt = addMinutes(startsAt, service.duration_minutes);
        // Clinic, patient, and service were already validated through the user-scoped Supabase client and RLS.
        // This Edge Function is the internal write boundary for appointment creation; appointments_no_overlap remains the final double-booking guard.
        const { data: appointment, error: insertError } = await supabaseAdmin
          .from("appointments")
          .insert({
            clinic_id,
            patient_id,
            service_id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            status: "scheduled",
            source,
            notes,
            patient_notes,
            created_by: user?.id ?? null,
          })
          .select("*")
          .single();

        if (insertError) {
          if (isOverlapError(insertError)) {
            return createErrorResponse(
              409,
              "Appointment overlaps an existing appointment",
              { code: "appointment_overlap" },
            );
          }

          console.error("Failed to book appointment:", insertError);
          return createErrorResponse(500, "Failed to book appointment");
        }

        try {
          const { error: reminderError } = await supabaseAdmin
            .from("reminders")
            .insert({
              clinic_id,
              appointment_id: appointment.id,
              patient_id,
              scheduled_for: getReminderScheduledFor(startsAt).toISOString(),
              channel: "sms",
              status: "pending",
              template_key: "appointment_confirmation_24h",
            });

          if (reminderError) {
            console.warn(
              "Failed to create appointment reminder:",
              reminderError,
            );
          }
        } catch (error) {
          console.warn(
            "Failed to create appointment reminder:",
            error,
          );
        }

        const actor = getActivityActor(source, user);
        const details = {
          patient_id,
          service_id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          source,
          ...(notes ? { notes } : {}),
        };

        try {
          const { error: activityLogError } = await supabaseAdmin
            .from("chairside_activity_log")
            .insert({
              clinic_id,
              ...actor,
              action: "appointment.created",
              entity_type: "appointment",
              entity_id: appointment.id,
              details,
            });

          if (activityLogError) {
            console.warn(
              "Failed to write appointment activity log:",
              activityLogError,
            );
          }
        } catch (error) {
          console.warn(
            "Failed to write appointment activity log:",
            error,
          );
        }

        return jsonResponse({ appointment }, 201);
      }),
    ),
  ),
);
