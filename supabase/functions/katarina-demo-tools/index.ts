import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";

const tools = [
  "lookup_patient_by_phone",
  "list_available_slots",
  "create_demo_appointment",
  "record_reminder_response",
] as const;

type ToolName = (typeof tools)[number];
type JsonObject = Record<string, unknown>;

type DemoToolRequest = {
  tool?: unknown;
  arguments?: unknown;
};

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
};

type Slot = {
  slot_id: string;
  starts_at: string;
  ends_at: string;
  display_text_sk: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isToolName(value: string): value is ToolName {
  return tools.includes(value as ToolName);
}

function hasListAvailableSlotsArgument(value: JsonObject) {
  return "reason" in value || "patient_id" in value || "clinic_id" in value;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function setUtcTime(date: Date, hour: number, minute: number) {
  const next = new Date(date);
  next.setUTCHours(hour, minute, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatSlotSk(date: Date) {
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function createDemoSlots(): Slot[] {
  const base = new Date();
  const definitions = [
    { days: 2, hour: 8, minute: 30 },
    { days: 3, hour: 12, minute: 0 },
    { days: 4, hour: 7, minute: 15 },
  ];

  return definitions.map((definition, index) => {
    const startsAt = setUtcTime(
      addDays(base, definition.days),
      definition.hour,
      definition.minute,
    );
    const endsAt = addMinutes(startsAt, 30);

    return {
      slot_id: `demo-slot-${index + 1}`,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      display_text_sk: formatSlotSk(startsAt),
    };
  });
}

async function handleLookupPatientByPhone(args: JsonObject, req: Request) {
  const phone = cleanText(args.phone);
  const authorization = req.headers.get("Authorization") ?? "";

  if (!phone) {
    return createErrorResponse(400, "Missing phone", {
      ok: false,
      error: "missing_phone",
    });
  }

  if (!authorization) {
    return createErrorResponse(401, "Missing authorization header", {
      ok: false,
      error: "missing_authorization",
      demo_mode: true,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    },
  );

  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone")
    .eq("phone", phone)
    .limit(1)
    .returns<Patient[]>();

  if (error) {
    console.error("Katarina demo patient lookup failed:", error);
    return createErrorResponse(500, "Unexpected error", {
      ok: false,
      error: "patient_lookup_failed",
    });
  }

  const patient = data?.[0];
  if (!patient) {
    return jsonResponse({
      ok: false,
      error: "patient_not_found",
      demo_mode: true,
    });
  }

  return jsonResponse({
    ok: true,
    patient,
    demo_mode: true,
  });
}

function handleListAvailableSlots(args: JsonObject, metadata: JsonObject = {}) {
  const clinicId = cleanText(args.clinic_id) || null;
  const patientId = cleanText(args.patient_id) || null;
  const reason = cleanText(args.reason) || "preventive_checkup";
  const slots = createDemoSlots();

  return jsonResponse({
    ok: true,
    clinic_id: clinicId,
    patient_id: patientId,
    reason,
    timezone: "Europe/Bratislava",
    slots,
    metadata: {
      demo_mode: true,
      source: "deterministic_demo_slots",
      ...metadata,
    },
  });
}

function handleCreateDemoAppointment(args: JsonObject) {
  const patientId = cleanText(args.patient_id);
  const slotStart = cleanText(args.slot_start);

  if (!patientId) {
    return createErrorResponse(400, "Missing patient_id", {
      ok: false,
      error: "missing_patient_id",
    });
  }

  if (!slotStart || Number.isNaN(Date.parse(slotStart))) {
    return createErrorResponse(400, "Invalid slot_start", {
      ok: false,
      error: "invalid_slot_start",
    });
  }

  if (args.confirmed_by_patient !== true) {
    return createErrorResponse(400, "Patient confirmation is required", {
      ok: false,
      error: "confirmation_required",
      demo_mode: true,
    });
  }

  const reason = cleanText(args.reason) || "preventive_checkup";

  return jsonResponse({
    ok: true,
    demo_mode: true,
    appointment: {
      id: `demo-${crypto.randomUUID()}`,
      patient_id: patientId,
      starts_at: new Date(slotStart).toISOString(),
      status: "confirmed",
      reason,
    },
    metadata: {
      source: "simulated_demo_appointment",
      writes_database: false,
      sends_sms: false,
    },
  });
}

function handleRecordReminderResponse(args: JsonObject) {
  const reminderId = cleanText(args.reminder_id);
  const responseStatus = cleanText(args.response_status);
  const allowedStatuses = ["confirmed", "declined", "needs_review"];

  if (!reminderId) {
    return createErrorResponse(400, "Missing reminder_id", {
      ok: false,
      error: "missing_reminder_id",
    });
  }

  if (!allowedStatuses.includes(responseStatus)) {
    return createErrorResponse(400, "Invalid response_status", {
      ok: false,
      error: "invalid_response_status",
      allowed_values: allowedStatuses,
    });
  }

  return jsonResponse({
    ok: true,
    demo_mode: true,
    reminder: {
      id: reminderId,
      response_status: responseStatus,
      simulated: true,
    },
    metadata: {
      source: "simulated_demo_reminder_response",
      writes_database: false,
      sends_sms: false,
      staff_review_rpc_used: false,
    },
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    try {
      if (req.method !== "POST") {
        return createErrorResponse(405, "Method Not Allowed");
      }

      let payload: DemoToolRequest;
      let emptyBodyFallback = false;
      let directPayloadFallback = false;
      let unknownObjectFallback = false;
      try {
        const body = await req.text();
        if (body.trim() === "") {
          payload = {
            tool: "list_available_slots",
            arguments: {
              reason: "preventive_checkup",
            },
          };
          emptyBodyFallback = true;
        } else {
          const parsedBody = JSON.parse(body);
          if (
            isObject(parsedBody) &&
            !("tool" in parsedBody) &&
            hasListAvailableSlotsArgument(parsedBody)
          ) {
            payload = {
              tool: "list_available_slots",
              arguments: parsedBody,
            };
            directPayloadFallback = true;
          } else {
            payload = parsedBody;
          }
        }
      } catch {
        return createErrorResponse(400, "Invalid JSON body", {
          ok: false,
          error: "invalid_json",
        });
      }

      let tool = cleanText(payload.tool);
      if (!isToolName(tool)) {
        if (isObject(payload) && tool !== "unknown_tool") {
          payload = {
            tool: "list_available_slots",
            arguments: payload,
          };
          tool = "list_available_slots";
          unknownObjectFallback = true;
        } else {
          return createErrorResponse(400, "Unsupported tool", {
            ok: false,
            error: "unsupported_tool",
            allowed_tools: tools,
          });
        }
      }

      if (!isObject(payload.arguments)) {
        return createErrorResponse(400, "Missing or invalid arguments", {
          ok: false,
          error: "invalid_arguments",
        });
      }

      switch (tool) {
        case "lookup_patient_by_phone":
          return await handleLookupPatientByPhone(payload.arguments, req);
        case "list_available_slots":
          return handleListAvailableSlots(payload.arguments, {
            ...(emptyBodyFallback ? { empty_body_fallback: true } : {}),
            ...(directPayloadFallback ? { direct_payload_fallback: true } : {}),
            ...(unknownObjectFallback ? { unknown_object_fallback: true } : {}),
          });
        case "create_demo_appointment":
          return handleCreateDemoAppointment(payload.arguments);
        case "record_reminder_response":
          return handleRecordReminderResponse(payload.arguments);
      }
    } catch (error) {
      console.error("Unexpected Katarina demo tools error:", error);
      return createErrorResponse(500, "Unexpected error", {
        ok: false,
        error: "unexpected_error",
      });
    }
  }),
);
