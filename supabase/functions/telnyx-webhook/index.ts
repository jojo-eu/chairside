import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type JsonObject = Record<string, unknown>;

type ProviderEventStatus = "received" | "duplicate";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function nestedObject(payload: JsonObject, key: string) {
  const value = payload[key];

  return isObject(value) ? value : null;
}

function extractProviderEventId(payload: JsonObject) {
  const data = nestedObject(payload, "data");

  return stringValue(data?.id) ??
    stringValue(payload.id) ??
    stringValue(payload.event_id);
}

function extractEventType(payload: JsonObject) {
  const data = nestedObject(payload, "data");

  return stringValue(data?.event_type) ??
    stringValue(payload.event_type) ??
    stringValue(payload.type) ??
    "unknown";
}

function extractResourceType(payload: JsonObject) {
  const data = nestedObject(payload, "data");

  return stringValue(data?.record_type) ?? stringValue(payload.record_type);
}

function extractResourceId(payload: JsonObject) {
  const data = nestedObject(payload, "data");
  const dataPayload = isObject(data?.payload) ? data.payload : null;

  return stringValue(dataPayload?.id) ?? stringValue(payload.resource_id);
}

function getFallbackProviderEventId(eventType: string) {
  const normalizedEventType = eventType.replace(/[^a-zA-Z0-9_.-]/g, "-");

  return `fallback-${normalizedEventType}-${Date.now()}`;
}

function isDuplicateProviderEvent(error: { code?: string; message?: string }) {
  return error.code === "23505" ||
    error.message?.includes("provider_events_provider_event_id_key") === true ||
    error.message?.includes("duplicate key value violates unique constraint") ===
      true;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return createErrorResponse(400, "Invalid JSON body");
    }

    if (!isObject(payload)) {
      return createErrorResponse(400, "JSON body must be an object");
    }

    // TODO: Verify the real Telnyx webhook signature before production use.
    // This skeleton stores raw fake/test events only and does not trust payload fields for business actions.
    const eventType = extractEventType(payload);
    const providerEventId = extractProviderEventId(payload) ??
      getFallbackProviderEventId(eventType);
    const resourceType = extractResourceType(payload);
    const resourceId = extractResourceId(payload);

    const { data: providerEvent, error } = await supabaseAdmin
      .from("provider_events")
      .insert({
        clinic_id: null,
        provider: "telnyx",
        provider_event_id: providerEventId,
        event_type: eventType,
        resource_type: resourceType,
        resource_id: resourceId,
        processing_status: "received",
        payload,
      })
      .select(
        "id, clinic_id, provider, provider_event_id, event_type, resource_type, resource_id, processing_status, received_at",
      )
      .single();

    if (error) {
      if (isDuplicateProviderEvent(error)) {
        return jsonResponse({
          status: "duplicate" satisfies ProviderEventStatus,
          provider: "telnyx",
          provider_event_id: providerEventId,
          event_type: eventType,
        });
      }

      console.error("Failed to store Telnyx provider event:", error);
      return createErrorResponse(500, "Failed to store provider event");
    }

    return jsonResponse({
      status: "received" satisfies ProviderEventStatus,
      provider_event: providerEvent,
    });
  })
);
