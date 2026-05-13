import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware } from "../_shared/authentication.ts";

type AvailabilityRequest = {
  clinic_id?: string;
  service_id?: string;
  date?: string;
};

type Clinic = {
  id: string;
  timezone: string | null;
  config: {
    working_hours?: Record<string, WorkingHoursInterval[]>;
  } | null;
};

type Service = {
  id: string;
  clinic_id: string;
  duration_minutes: number;
  buffer_minutes: number;
  active: boolean;
};

type Appointment = {
  starts_at: string;
  ends_at: string;
};

type WorkingHoursInterval = {
  start: string;
  end: string;
};

const DEFAULT_TIMEZONE = "Europe/Bratislava";
const SLOT_STEP_MINUTES = 15;

const fallbackWorkingHours: Record<string, WorkingHoursInterval[]> = {
  mon: [{ start: "08:00", end: "16:00" }],
  tue: [{ start: "08:00", end: "16:00" }],
  wed: [{ start: "08:00", end: "16:00" }],
  thu: [{ start: "08:00", end: "16:00" }],
  fri: [{ start: "08:00", end: "16:00" }],
  sat: [],
  sun: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isValidIsoDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function getDayKey(date: string, timezone: string) {
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  })
    .format(localDateTimeToUtc(date, "12:00", timezone))
    .toLowerCase();

  return day.slice(0, 3);
}

function getTimezoneOffsetMilliseconds(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

function localDateTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimezoneOffsetMilliseconds(utcGuess, timezone);
  const adjusted = new Date(utcGuess.getTime() - offset);
  const adjustedOffset = getTimezoneOffsetMilliseconds(adjusted, timezone);

  return new Date(utcGuess.getTime() - adjustedOffset);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDaysToIsoDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function overlaps(
  candidateStart: Date,
  candidateEndWithBuffer: Date,
  appointments: Appointment[],
) {
  return appointments.some((appointment) => {
    const appointmentStart = new Date(appointment.starts_at);
    const appointmentEnd = new Date(appointment.ends_at);

    return candidateStart < appointmentEnd &&
      appointmentStart < candidateEndWithBuffer;
  });
}

function getWorkingHours(clinic: Clinic, dayKey: string) {
  const configured = clinic.config?.working_hours?.[dayKey];

  if (Array.isArray(configured)) {
    return configured;
  }

  return fallbackWorkingHours[dayKey] ?? [];
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) => {
      if (req.method !== "POST") {
        return createErrorResponse(405, "Method Not Allowed");
      }

      let payload: AvailabilityRequest;
      try {
        payload = await req.json();
      } catch {
        return createErrorResponse(400, "Invalid JSON body");
      }

      const { clinic_id, service_id, date } = payload;
      if (!clinic_id || !service_id || !date) {
        return createErrorResponse(
          400,
          "Missing clinic_id, service_id, or date",
        );
      }
      if (!isValidIsoDate(date)) {
        return createErrorResponse(400, "date must use YYYY-MM-DD format");
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
        {
          global: {
            headers: {
              Authorization: req.headers.get("Authorization") ?? "",
            },
          },
        },
      );

      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .select("id, timezone, config")
        .eq("id", clinic_id)
        .single<Clinic>();

      if (clinicError || !clinic) {
        return createErrorResponse(404, "Clinic not found or not accessible");
      }

      const { data: service, error: serviceError } = await supabase
        .from("services")
        .select("id, clinic_id, duration_minutes, buffer_minutes, active")
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
      const dayStart = localDateTimeToUtc(date, "00:00", timezone);
      const nextDayStart = localDateTimeToUtc(
        addDaysToIsoDate(date, 1),
        "00:00",
        timezone,
      );

      const { data: closures, error: closuresError } = await supabase
        .from("clinic_closures")
        .select("id")
        .eq("clinic_id", clinic_id)
        .eq("date", date);

      if (closuresError) {
        return createErrorResponse(500, "Failed to load clinic closures");
      }
      if ((closures?.length ?? 0) > 0) {
        return jsonResponse({
          clinic_id,
          service_id,
          date,
          timezone,
          slot_step_minutes: SLOT_STEP_MINUTES,
          service_duration_minutes: service.duration_minutes,
          buffer_minutes: service.buffer_minutes,
          slots: [],
        });
      }

      const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("starts_at, ends_at")
        .eq("clinic_id", clinic_id)
        .not("status", "in", "(cancelled,no_show)")
        .lt("starts_at", nextDayStart.toISOString())
        .gt("ends_at", dayStart.toISOString())
        .returns<Appointment[]>();

      if (appointmentsError) {
        return createErrorResponse(500, "Failed to load appointments");
      }

      const workingHours = getWorkingHours(clinic, getDayKey(date, timezone));
      const slots = workingHours.flatMap((interval) => {
        const intervalStart = localDateTimeToUtc(date, interval.start, timezone);
        const intervalEnd = localDateTimeToUtc(date, interval.end, timezone);
        const latestStart = addMinutes(
          intervalEnd,
          -(service.duration_minutes + service.buffer_minutes),
        );
        const intervalSlots: { starts_at: string; ends_at: string }[] = [];

        for (
          let startsAt = intervalStart;
          startsAt <= latestStart;
          startsAt = addMinutes(startsAt, SLOT_STEP_MINUTES)
        ) {
          const endsAt = addMinutes(startsAt, service.duration_minutes);
          const endsAtWithBuffer = addMinutes(endsAt, service.buffer_minutes);

          if (!overlaps(startsAt, endsAtWithBuffer, appointments ?? [])) {
            intervalSlots.push({
              starts_at: startsAt.toISOString(),
              ends_at: endsAt.toISOString(),
            });
          }
        }

        return intervalSlots;
      });

      return jsonResponse({
        clinic_id,
        service_id,
        date,
        timezone,
        slot_step_minutes: SLOT_STEP_MINUTES,
        service_duration_minutes: service.duration_minutes,
        buffer_minutes: service.buffer_minutes,
        slots,
      });
    }),
  ),
);
