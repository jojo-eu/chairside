import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type MarkReminderSentRequest = {
  clinic_id?: string;
  reminder_id?: string;
  provider?: MessageProvider;
  provider_message_id?: string | null;
  body?: string | null;
};

type MessageProvider = "system" | "manual" | "telnyx";

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

function getPlaceholderBody(reminder: Reminder) {
  return `Reminder ${reminder.template_key} marked as sent.`;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let payload: MarkReminderSentRequest;
        try {
          payload = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body");
        }

        const {
          clinic_id,
          reminder_id,
          provider = "system",
          provider_message_id = null,
          body = null,
        } = payload;

        if (!clinic_id || !reminder_id) {
          return createErrorResponse(400, "Missing clinic_id or reminder_id");
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
            "Reminder channel cannot be recorded as an outbound message",
          );
        }

        const sentAt = new Date().toISOString();
        const { data: updatedReminder, error: updateError } = await supabaseAdmin
          .from("reminders")
          .update({ status: "sent", sent_at: sentAt })
          .eq("id", reminder.id)
          .eq("clinic_id", clinic_id)
          .neq("status", "cancelled")
          .select("*")
          .single();

        if (updateError || !updatedReminder) {
          return createErrorResponse(500, "Failed to mark reminder as sent");
        }

        const { data: message, error: messageError } = await supabaseAdmin
          .from("messages")
          .insert({
            clinic_id,
            patient_id: reminder.patient_id,
            appointment_id: reminder.appointment_id,
            reminder_id: reminder.id,
            direction: "outbound",
            channel: reminder.channel,
            provider,
            provider_message_id,
            body: body || getPlaceholderBody(reminder),
            status: "sent",
            sent_at: sentAt,
            metadata: {
              local_internal: true,
              template_key: reminder.template_key,
            },
          })
          .select("*")
          .single();

        if (messageError || !message) {
          console.error(
            "Reminder was marked sent, but message creation failed:",
            messageError,
          );
          return createErrorResponse(
            500,
            "Reminder marked sent, but outbound message creation failed",
            { code: "message_create_failed" },
          );
        }

        return jsonResponse({ reminder: updatedReminder, message });
      }),
    ),
  ),
);
