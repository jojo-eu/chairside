import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type ProcessProviderEventRequest = {
  provider_event_id?: string;
  processor?: string;
  action?: string;
};

type JsonObject = Record<string, unknown>;
type Provider = "telnyx" | "vapi" | "system" | "manual";
type MappingType =
  | "phone_number"
  | "assistant_id"
  | "account_id"
  | "messaging_profile_id"
  | "webhook_secret_id"
  | "other";

type ProviderEvent = {
  id: string;
  clinic_id: string | null;
  provider: Provider;
  provider_event_id: string;
  event_type: string;
  processing_status: "received" | "processed" | "ignored" | "failed";
};

type ProviderEventWithPayload = ProviderEvent & {
  payload: JsonObject;
};

type ProcessingAttempt = {
  id: string;
  provider_event_id: string;
  clinic_id: string | null;
  processor: string;
  action: string;
  status: "started" | "succeeded" | "failed" | "ignored";
  started_at: string;
  finished_at: string | null;
  idempotency_key: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
};

type MessageRow = {
  id: string;
  status: string;
  sent_at: string | null;
  metadata: Record<string, unknown> | null;
};

type OutboundReminderMessage = {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string;
  reminder_id: string;
  channel: string;
  sent_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type ExistingInboundMessage = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  reminder_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

type ProviderMapping = {
  id: string;
  clinic_id: string;
  provider: Provider;
  mapping_type: MappingType;
  provider_identifier: string;
  label: string | null;
  active: boolean;
};

type MappingCandidate = {
  mapping_type: MappingType;
  provider_identifier: string;
  source: string;
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedObject(value: unknown, key: string) {
  if (!isObject(value)) return null;

  const child = value[key];
  return isObject(child) ? child : null;
}

function stringAtPath(payload: JsonObject, path: string[]) {
  let cursor: unknown = payload;

  for (const key of path) {
    if (!isObject(cursor)) return null;
    cursor = cursor[key];
  }

  return stringValue(cursor);
}

function addCandidate(
  candidates: MappingCandidate[],
  mappingType: MappingType,
  providerIdentifier: string | null,
  source: string,
) {
  if (!providerIdentifier) return;

  const duplicate = candidates.some(
    (candidate) =>
      candidate.mapping_type === mappingType &&
      candidate.provider_identifier === providerIdentifier,
  );

  if (!duplicate) {
    candidates.push({
      mapping_type: mappingType,
      provider_identifier: providerIdentifier,
      source,
    });
  }
}

function deriveTelnyxCandidates(payload: JsonObject) {
  const candidates: MappingCandidate[] = [];
  const dataPayload = nestedObject(nestedObject(payload, "data"), "payload");

  addCandidate(
    candidates,
    "phone_number",
    stringValue(dataPayload?.to),
    "payload.data.payload.to",
  );
  addCandidate(
    candidates,
    "phone_number",
    stringValue(dataPayload?.from),
    "payload.data.payload.from",
  );
  addCandidate(
    candidates,
    "messaging_profile_id",
    stringValue(dataPayload?.messaging_profile_id),
    "payload.data.payload.messaging_profile_id",
  );

  return candidates;
}

function deriveVapiCandidates(payload: JsonObject) {
  const candidates: MappingCandidate[] = [];

  addCandidate(
    candidates,
    "assistant_id",
    stringAtPath(payload, ["message", "assistant", "id"]),
    "payload.message.assistant.id",
  );
  addCandidate(
    candidates,
    "assistant_id",
    stringAtPath(payload, ["assistant", "id"]),
    "payload.assistant.id",
  );
  addCandidate(
    candidates,
    "assistant_id",
    stringAtPath(payload, ["call", "assistantId"]),
    "payload.call.assistantId",
  );
  addCandidate(
    candidates,
    "phone_number",
    stringAtPath(payload, ["call", "phoneNumber", "number"]),
    "payload.call.phoneNumber.number",
  );
  addCandidate(
    candidates,
    "phone_number",
    stringAtPath(payload, ["phoneNumber", "number"]),
    "payload.phoneNumber.number",
  );
  addCandidate(
    candidates,
    "account_id",
    stringAtPath(payload, ["account", "id"]),
    "payload.account.id",
  );

  return candidates;
}

function deriveCandidates(providerEvent: ProviderEventWithPayload) {
  if (providerEvent.provider === "telnyx") {
    return deriveTelnyxCandidates(providerEvent.payload);
  }

  if (providerEvent.provider === "vapi") {
    return deriveVapiCandidates(providerEvent.payload);
  }

  return [];
}

async function findMapping(provider: Provider, candidates: MappingCandidate[]) {
  for (const candidate of candidates) {
    const { data, error } = await supabaseAdmin
      .from("provider_mappings")
      .select(
        "id, clinic_id, provider, mapping_type, provider_identifier, label, active",
      )
      .eq("provider", provider)
      .eq("mapping_type", candidate.mapping_type)
      .eq("provider_identifier", candidate.provider_identifier)
      .eq("active", true)
      .limit(1)
      .returns<ProviderMapping[]>();

    if (error) {
      throw error;
    }

    const mapping = data?.[0];
    if (mapping) {
      return { mapping, candidate };
    }
  }

  return null;
}

function isDuplicateIdempotencyKey(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" ||
    error.message?.includes("provider_event_attempts_idempotency_key_idx") ===
      true ||
    error.message?.includes(
      "duplicate key value violates unique constraint",
    ) === true
  );
}

function classifySkeleton(providerEvent: ProviderEvent) {
  const knownTelnyxEvents = new Set([
    "message.sent",
    "message.delivered",
    "message.failed",
    "message.received",
  ]);
  const knownVapiEvents = new Set([
    "call.started",
    "call.ended",
    "call.failed",
    "call.missed",
  ]);
  const isKnown =
    (providerEvent.provider === "telnyx" &&
      knownTelnyxEvents.has(providerEvent.event_type)) ||
    (providerEvent.provider === "vapi" &&
      knownVapiEvents.has(providerEvent.event_type));

  return {
    skeleton: true,
    classification: isKnown ? "known_ignored" : "unsupported_ignored",
    reason: "processor skeleton only",
    provider: providerEvent.provider,
    event_type: providerEvent.event_type,
  };
}

function isTelnyxOutboundStatusEvent(providerEvent: ProviderEvent) {
  return (
    providerEvent.provider === "telnyx" &&
    ["message.sent", "message.delivered", "message.failed"].includes(
      providerEvent.event_type,
    )
  );
}

function getTelnyxMessageStatus(eventType: string) {
  if (eventType === "message.sent") return "sent";
  if (eventType === "message.delivered") return "delivered";
  if (eventType === "message.failed") return "failed";

  return null;
}

function isDuplicateMessageKey(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" ||
    error.message?.includes("messages_provider_message_unique_idx") === true ||
    error.message?.includes(
      "duplicate key value violates unique constraint",
    ) === true
  );
}

function normalizeResponseBody(body: string) {
  return body
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function parseResponseStatus(body: string) {
  const normalized = normalizeResponseBody(body);

  if (["ano", "yes", "y"].includes(normalized)) {
    return "confirmed";
  }
  if (["nie", "no", "n"].includes(normalized)) {
    return "declined";
  }

  return "needs_review";
}

function extractTelnyxProviderMessageId(payload: JsonObject) {
  const data = nestedObject(payload, "data");
  const dataPayload = nestedObject(data, "payload");

  return (
    stringValue(dataPayload?.id) ??
    stringValue(dataPayload?.message_id) ??
    stringValue(payload.resource_id) ??
    stringValue(data?.id)
  );
}

function extractTelnyxInboundText(payload: JsonObject) {
  const dataPayload = nestedObject(nestedObject(payload, "data"), "payload");

  return stringValue(dataPayload?.text) ?? stringValue(dataPayload?.body);
}

function extractTelnyxPayloadPhone(payload: JsonObject, field: "from" | "to") {
  const dataPayload = nestedObject(nestedObject(payload, "data"), "payload");

  return stringValue(dataPayload?.[field]);
}

async function loadProviderEventPayload(providerEventId: string) {
  const { data, error } = await supabaseAdmin
    .from("provider_events")
    .select("payload")
    .eq("id", providerEventId)
    .single<{ payload: JsonObject }>();

  if (error || !data?.payload || !isObject(data.payload)) {
    throw error ?? new Error("Provider event payload not found");
  }

  return data.payload;
}

async function processTelnyxOutboundStatus(
  providerEvent: ProviderEvent,
  finishedAt: string,
) {
  if (!isTelnyxOutboundStatusEvent(providerEvent)) return null;

  const payload = await loadProviderEventPayload(providerEvent.id);
  const providerMessageId = extractTelnyxProviderMessageId(payload);
  const messageStatus = getTelnyxMessageStatus(providerEvent.event_type);

  if (!providerMessageId || !messageStatus) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_outbound_status",
        outcome: "provider_message_id_not_found",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
      },
    };
  }

  const { data: messages, error: messageLookupError } = await supabaseAdmin
    .from("messages")
    .select("id, status, sent_at, metadata")
    .eq("clinic_id", providerEvent.clinic_id)
    .eq("provider", "telnyx")
    .eq("provider_message_id", providerMessageId)
    .eq("direction", "outbound")
    .limit(1)
    .returns<MessageRow[]>();

  if (messageLookupError) {
    throw messageLookupError;
  }

  const message = messages?.[0];
  if (!message) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_outbound_status",
        outcome: "message_not_found",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
      },
    };
  }

  const metadata = isObject(message.metadata) ? message.metadata : {};
  const update: Record<string, unknown> = {
    status: messageStatus,
    metadata: {
      ...metadata,
      telnyx_status: {
        provider_event_id: providerEvent.id,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
        processed_at: finishedAt,
      },
    },
  };

  if (messageStatus === "sent" && !message.sent_at) {
    update.sent_at = finishedAt;
  }

  const { data: updatedMessage, error: updateMessageError } =
    await supabaseAdmin
      .from("messages")
      .update(update)
      .eq("id", message.id)
      .select("id, status, sent_at, metadata")
      .single<MessageRow>();

  if (updateMessageError || !updatedMessage) {
    throw updateMessageError ?? new Error("Message status update failed");
  }

  return {
    attemptStatus: "succeeded" as const,
    providerEventStatus: "processed" as const,
    result: {
      processor: "telnyx_outbound_status",
      outcome: "message_status_updated",
      provider: providerEvent.provider,
      event_type: providerEvent.event_type,
      provider_message_id: providerMessageId,
      message: {
        id: updatedMessage.id,
        status: updatedMessage.status,
      },
    },
  };
}

async function loadExistingInboundMessage(providerMessageId: string) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select(
      "id, clinic_id, patient_id, appointment_id, reminder_id, status, metadata",
    )
    .eq("provider", "telnyx")
    .eq("provider_message_id", providerMessageId)
    .eq("direction", "inbound")
    .maybeSingle<ExistingInboundMessage>();

  if (error) throw error;

  return data;
}

async function processTelnyxInboundResponse(
  providerEvent: ProviderEvent,
  finishedAt: string,
) {
  if (
    providerEvent.provider !== "telnyx" ||
    providerEvent.event_type !== "message.received"
  ) {
    return null;
  }

  const payload = await loadProviderEventPayload(providerEvent.id);
  const providerMessageId = extractTelnyxProviderMessageId(payload);
  const inboundText = extractTelnyxInboundText(payload);
  const patientPhone = extractTelnyxPayloadPhone(payload, "from");
  const clinicPhone = extractTelnyxPayloadPhone(payload, "to");

  if (!providerMessageId) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "provider_message_id_not_found",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
      },
    };
  }

  if (!inboundText) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "empty_inbound_body",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
      },
    };
  }

  const existingInboundMessage =
    await loadExistingInboundMessage(providerMessageId);
  if (existingInboundMessage) {
    return {
      attemptStatus: "succeeded" as const,
      providerEventStatus: "processed" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "duplicate_inbound_message",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
        message: {
          id: existingInboundMessage.id,
          status: existingInboundMessage.status,
        },
      },
    };
  }

  if (!patientPhone) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "patient_phone_not_found",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
      },
    };
  }

  const { data: patient, error: patientError } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("clinic_id", providerEvent.clinic_id)
    .eq("phone", patientPhone)
    .maybeSingle<{ id: string }>();

  if (patientError) throw patientError;

  if (!patient) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "patient_not_found",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
        clinic_phone: clinicPhone,
      },
    };
  }

  const { data: candidates, error: candidateError } = await supabaseAdmin
    .from("messages")
    .select(
      "id, clinic_id, patient_id, appointment_id, reminder_id, channel, sent_at, created_at, metadata",
    )
    .eq("clinic_id", providerEvent.clinic_id)
    .eq("provider", "telnyx")
    .eq("direction", "outbound")
    .eq("patient_id", patient.id)
    .not("reminder_id", "is", null)
    .not("appointment_id", "is", null)
    .in("status", ["sent", "delivered"])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2)
    .returns<OutboundReminderMessage[]>();

  if (candidateError) throw candidateError;

  if (!candidates || candidates.length === 0) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "no_safe_reminder_match",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
        patient_id: patient.id,
        clinic_phone: clinicPhone,
      },
    };
  }

  if (candidates.length > 1) {
    return {
      attemptStatus: "ignored" as const,
      providerEventStatus: "ignored" as const,
      result: {
        processor: "telnyx_inbound_response",
        outcome: "ambiguous_match",
        provider: providerEvent.provider,
        event_type: providerEvent.event_type,
        provider_message_id: providerMessageId,
        patient_id: patient.id,
        candidate_count: candidates.length,
        candidate_message_ids: candidates.map((candidate) => candidate.id),
      },
    };
  }

  const outboundMessage = candidates[0];
  const parsedResponse = parseResponseStatus(inboundText);
  const inboundMetadata: Record<string, unknown> = {
    parsed_response: parsedResponse,
    provider_event_id: providerEvent.id,
    matched_outbound_message_id: outboundMessage.id,
  };
  if (
    isObject(outboundMessage.metadata) &&
    outboundMessage.metadata.template_key
  ) {
    inboundMetadata.template_key = outboundMessage.metadata.template_key;
  }

  const { data: inboundMessage, error: inboundMessageError } =
    await supabaseAdmin
      .from("messages")
      .insert({
        clinic_id: providerEvent.clinic_id,
        patient_id: outboundMessage.patient_id,
        appointment_id: outboundMessage.appointment_id,
        reminder_id: outboundMessage.reminder_id,
        direction: "inbound",
        channel:
          outboundMessage.channel === "sms" ? outboundMessage.channel : "sms",
        provider: "telnyx",
        provider_message_id: providerMessageId,
        body: inboundText,
        status: "received",
        received_at: finishedAt,
        metadata: inboundMetadata,
      })
      .select("id, status, metadata")
      .single<MessageRow>();

  if (inboundMessageError) {
    if (isDuplicateMessageKey(inboundMessageError)) {
      const duplicateMessage =
        await loadExistingInboundMessage(providerMessageId);

      return {
        attemptStatus: "succeeded" as const,
        providerEventStatus: "processed" as const,
        result: {
          processor: "telnyx_inbound_response",
          outcome: "duplicate_inbound_message",
          provider: providerEvent.provider,
          event_type: providerEvent.event_type,
          provider_message_id: providerMessageId,
          message: duplicateMessage
            ? { id: duplicateMessage.id, status: duplicateMessage.status }
            : null,
        },
      };
    }

    throw inboundMessageError;
  }

  if (!inboundMessage) {
    throw new Error("Inbound message insert failed");
  }

  const { data: updatedReminder, error: reminderUpdateError } =
    await supabaseAdmin
      .from("reminders")
      .update({
        status: "responded",
        response_status: parsedResponse,
        response_received_at: finishedAt,
      })
      .eq("id", outboundMessage.reminder_id)
      .eq("clinic_id", providerEvent.clinic_id)
      .neq("status", "cancelled")
      .select("id, status, response_status, response_received_at")
      .single();

  if (reminderUpdateError || !updatedReminder) {
    throw reminderUpdateError ?? new Error("Reminder response update failed");
  }

  return {
    attemptStatus: "succeeded" as const,
    providerEventStatus: "processed" as const,
    result: {
      processor: "telnyx_inbound_response",
      outcome: "reminder_response_recorded",
      provider: providerEvent.provider,
      event_type: providerEvent.event_type,
      provider_message_id: providerMessageId,
      parsed_response: parsedResponse,
      matching: {
        strategy: "latest_outbound_for_patient",
        note: "Local skeleton match constrained by clinic, patient phone, outbound reminder message, and sent/delivered status.",
        patient_phone: patientPhone,
        clinic_phone: clinicPhone,
      },
      message: {
        id: inboundMessage.id,
        status: inboundMessage.status,
      },
      reminder: {
        id: updatedReminder.id,
        status: updatedReminder.status,
        response_status: updatedReminder.response_status,
      },
    },
  };
}

function summarizeMapping(mapping: ProviderMapping) {
  return {
    id: mapping.id,
    clinic_id: mapping.clinic_id,
    provider: mapping.provider,
    mapping_type: mapping.mapping_type,
    provider_identifier: mapping.provider_identifier,
    label: mapping.label,
    active: mapping.active,
  };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let payload: ProcessProviderEventRequest;
        try {
          payload = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body");
        }

        const providerEventId = payload.provider_event_id;
        const processor = cleanText(payload.processor, "manual-skeleton");
        const action = cleanText(payload.action, "classify-only");

        if (!providerEventId || !uuidRegex.test(providerEventId)) {
          return createErrorResponse(400, "Invalid provider_event_id");
        }

        const authHeader = req.headers.get("Authorization") ?? "";
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );

        const { data: visibleProviderEvent, error: providerEventError } =
          await supabase
            .from("provider_events")
            .select(
              "id, clinic_id, provider, provider_event_id, event_type, processing_status",
            )
            .eq("id", providerEventId)
            .maybeSingle<ProviderEvent>();

        if (providerEventError) {
          return createErrorResponse(
            404,
            "Provider event not found or not accessible",
          );
        }

        let providerEvent = visibleProviderEvent;
        let autoMapping: {
          matched_mapping: ReturnType<typeof summarizeMapping>;
          matched_candidate: MappingCandidate;
          candidates_tried: MappingCandidate[];
        } | null = null;

        if (!providerEvent) {
          // Admin access is intentional for this narrow mapping step:
          // unmapped provider_events have clinic_id = null and are hidden by
          // normal clinic RLS. Raw payload is used only for candidate
          // derivation and is not returned to callers.
          const { data: rawProviderEvent, error: rawProviderEventError } =
            await supabaseAdmin
              .from("provider_events")
              .select(
                "id, clinic_id, provider, provider_event_id, event_type, processing_status, payload",
              )
              .eq("id", providerEventId)
              .single<ProviderEventWithPayload>();

          if (rawProviderEventError || !rawProviderEvent) {
            return createErrorResponse(
              404,
              "Provider event not found or not accessible",
            );
          }

          if (rawProviderEvent.clinic_id) {
            return createErrorResponse(
              404,
              "Provider event not found or not accessible",
            );
          }

          const candidates = deriveCandidates(rawProviderEvent);
          if (candidates.length === 0) {
            return createErrorResponse(404, "Provider mapping not found", {
              code: "provider_mapping_not_found",
              candidates_tried: candidates,
            });
          }

          let match: Awaited<ReturnType<typeof findMapping>>;
          try {
            match = await findMapping(rawProviderEvent.provider, candidates);
          } catch (error) {
            console.error("Provider mapping lookup failed:", error);
            return createErrorResponse(500, "Provider mapping lookup failed", {
              code: "provider_mapping_lookup_failed",
            });
          }

          if (!match) {
            return createErrorResponse(404, "Provider mapping not found", {
              code: "provider_mapping_not_found",
              candidates_tried: candidates,
            });
          }

          const { data: visibleMapping, error: visibleMappingError } =
            await supabase
              .from("provider_mappings")
              .select("id")
              .eq("id", match.mapping.id)
              .maybeSingle<{ id: string }>();

          if (visibleMappingError || !visibleMapping) {
            return createErrorResponse(
              404,
              "Provider event not found or not accessible",
            );
          }

          const { data: mappedProviderEvent, error: mapError } =
            await supabaseAdmin
              .from("provider_events")
              .update({ clinic_id: match.mapping.clinic_id })
              .eq("id", rawProviderEvent.id)
              .select(
                "id, clinic_id, provider, provider_event_id, event_type, processing_status",
              )
              .single<ProviderEvent>();

          if (mapError || !mappedProviderEvent) {
            console.error("Failed to map provider event to clinic:", mapError);
            return createErrorResponse(
              500,
              "Failed to map provider event to clinic",
              { code: "provider_event_mapping_failed" },
            );
          }

          providerEvent = mappedProviderEvent;
          autoMapping = {
            matched_mapping: summarizeMapping(match.mapping),
            matched_candidate: match.candidate,
            candidates_tried: candidates,
          };
        }

        if (!providerEvent.clinic_id) {
          return createErrorResponse(409, "Provider event is not mapped", {
            code: "unmapped_event",
          });
        }

        const idempotencyKey = `${providerEvent.provider}:${providerEvent.id}:${action}`;
        const startedAt = new Date().toISOString();

        const { data: attempt, error: attemptError } = await supabaseAdmin
          .from("provider_event_processing_attempts")
          .insert({
            provider_event_id: providerEvent.id,
            clinic_id: providerEvent.clinic_id,
            processor,
            action,
            status: "started",
            started_at: startedAt,
            idempotency_key: idempotencyKey,
          })
          .select(
            "id, provider_event_id, clinic_id, processor, action, status, started_at, finished_at, idempotency_key, result, error_message",
          )
          .single<ProcessingAttempt>();

        if (attemptError) {
          if (isDuplicateIdempotencyKey(attemptError)) {
            const { data: existingAttempt } = await supabaseAdmin
              .from("provider_event_processing_attempts")
              .select(
                "id, provider_event_id, clinic_id, processor, action, status, started_at, finished_at, idempotency_key, result, error_message",
              )
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle<ProcessingAttempt>();

            return jsonResponse({
              status: "duplicate",
              provider_event: {
                id: providerEvent.id,
                clinic_id: providerEvent.clinic_id,
                provider: providerEvent.provider,
                event_type: providerEvent.event_type,
                processing_status: providerEvent.processing_status,
              },
              attempt: existingAttempt,
              auto_mapping: autoMapping,
            });
          }

          console.error(
            "Failed to create provider processing attempt:",
            attemptError,
          );
          return createErrorResponse(
            500,
            "Failed to create provider processing attempt",
          );
        }

        try {
          const finishedAt = new Date().toISOString();
          const telnyxStatusResult = await processTelnyxOutboundStatus(
            providerEvent,
            finishedAt,
          );
          const telnyxInboundResponseResult = telnyxStatusResult
            ? null
            : await processTelnyxInboundResponse(providerEvent, finishedAt);
          const processorResult = telnyxStatusResult ??
            telnyxInboundResponseResult ?? {
              attemptStatus: "ignored" as const,
              providerEventStatus: "ignored" as const,
              result: classifySkeleton(providerEvent),
            };

          const { data: updatedAttempt, error: updateAttemptError } =
            await supabaseAdmin
              .from("provider_event_processing_attempts")
              .update({
                status: processorResult.attemptStatus,
                finished_at: finishedAt,
                result: processorResult.result,
              })
              .eq("id", attempt.id)
              .select(
                "id, provider_event_id, clinic_id, processor, action, status, started_at, finished_at, idempotency_key, result, error_message",
              )
              .single<ProcessingAttempt>();

          if (updateAttemptError || !updatedAttempt) {
            throw updateAttemptError ?? new Error("Attempt update failed");
          }

          const { data: updatedProviderEvent, error: updateEventError } =
            await supabaseAdmin
              .from("provider_events")
              .update({
                processing_status: processorResult.providerEventStatus,
                processed_at: finishedAt,
                error_message: null,
              })
              .eq("id", providerEvent.id)
              .select(
                "id, clinic_id, provider, provider_event_id, event_type, processing_status, processed_at, error_message",
              )
              .single();

          if (updateEventError || !updatedProviderEvent) {
            throw updateEventError ?? new Error("Provider event update failed");
          }

          return jsonResponse({
            status: processorResult.providerEventStatus,
            provider_event: updatedProviderEvent,
            attempt: updatedAttempt,
            auto_mapping: autoMapping,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unexpected processor skeleton error";

          await supabaseAdmin
            .from("provider_event_processing_attempts")
            .update({
              status: "failed",
              finished_at: new Date().toISOString(),
              error_message: message,
            })
            .eq("id", attempt.id);

          await supabaseAdmin
            .from("provider_events")
            .update({
              processing_status: "failed",
              error_message: message,
            })
            .eq("id", providerEvent.id);

          console.error("Provider processor skeleton failed:", error);
          return createErrorResponse(500, "Provider processor skeleton failed");
        }
      }),
    ),
  ),
);
