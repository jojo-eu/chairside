import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type ReceiveReminderResponseRequest = {
  clinic_id?: string;
  reminder_id?: string;
  body?: string | null;
  provider?: MessageProvider;
  provider_message_id?: string | null;
};

type MessageProvider = "system" | "manual" | "telnyx";
type ResponseStatus = "confirmed" | "declined" | "needs_review";

type Reminder = {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string;
  status: string;
  channel: string;
  template_key: string;
};

const messageProviders = new Set<MessageProvider>([
  "system",
  "manual",
  "telnyx",
]);
const messageChannels = new Set(["sms", "whatsapp", "email"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function normalizeResponseBody(body: string) {
  return body
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function parseResponseStatus(body: string): ResponseStatus {
  const normalized = normalizeResponseBody(body);

  if (["ano", "yes", "y"].includes(normalized)) {
    return "confirmed";
  }
  if (["nie", "no", "n"].includes(normalized)) {
    return "declined";
  }

  return "needs_review";
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let payload: ReceiveReminderResponseRequest;
        try {
          payload = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body");
        }

        const {
          clinic_id,
          reminder_id,
          body,
          provider = "system",
          provider_message_id = null,
        } = payload;

        if (!clinic_id || !reminder_id || body == null) {
          return createErrorResponse(
            400,
            "Missing clinic_id, reminder_id, or body",
          );
        }
        if (body.trim().length === 0) {
          return createErrorResponse(400, "body must not be empty");
        }
        if (!messageProviders.has(provider)) {
          return createErrorResponse(400, "Invalid message provider");
        }

        const authHeader = req.headers.get("Authorization") ?? "";
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );

        const { data: reminder, error: reminderError } = await supabase
          .from("reminders")
          .select(
            "id, clinic_id, patient_id, appointment_id, status, channel, template_key",
          )
          .eq("id", reminder_id)
          .single<Reminder>();

        if (reminderError || !reminder) {
          return createErrorResponse(
            404,
            "Reminder not found or not accessible",
          );
        }
        if (reminder.clinic_id !== clinic_id) {
          return createErrorResponse(
            400,
            "Reminder does not belong to requested clinic",
          );
        }
        if (reminder.status === "cancelled") {
          return createErrorResponse(409, "Reminder is cancelled", {
            code: "reminder_cancelled",
          });
        }
        if (!messageChannels.has(reminder.channel)) {
          return createErrorResponse(
            400,
            "Reminder channel cannot be recorded as an inbound message",
          );
        }

        const receivedAt = new Date().toISOString();
        const parsedResponse = parseResponseStatus(body);

        const { data: message, error: messageError } = await supabaseAdmin
          .from("messages")
          .insert({
            clinic_id,
            patient_id: reminder.patient_id,
            appointment_id: reminder.appointment_id,
            reminder_id: reminder.id,
            direction: "inbound",
            channel: reminder.channel,
            provider,
            provider_message_id,
            body,
            status: "received",
            received_at: receivedAt,
            metadata: {
              parsed_response: parsedResponse,
              template_key: reminder.template_key,
            },
          })
          .select("*")
          .single();

        if (messageError || !message) {
          return createErrorResponse(
            500,
            "Failed to create inbound reminder response message",
          );
        }

        const { data: updatedReminder, error: updateError } = await supabaseAdmin
          .from("reminders")
          .update({
            status: "responded",
            response_status: parsedResponse,
            response_received_at: receivedAt,
          })
          .eq("id", reminder.id)
          .eq("clinic_id", clinic_id)
          .neq("status", "cancelled")
          .select("*")
          .single();

        if (updateError || !updatedReminder) {
          console.error(
            "Inbound message was created, but reminder response update failed:",
            updateError,
          );
          return createErrorResponse(
            500,
            "Inbound message created, but reminder response update failed",
            { code: "reminder_update_failed" },
          );
        }

        return jsonResponse({
          reminder: updatedReminder,
          message,
          parsed_response: parsedResponse,
        });
      }),
    ),
  ),
);
