import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type JsonObject = Record<string, unknown>;
type Provider = "telnyx" | "vapi" | "system" | "manual";
type MappingType =
  | "phone_number"
  | "assistant_id"
  | "account_id"
  | "messaging_profile_id"
  | "webhook_secret_id"
  | "other";

type MapProviderEventClinicRequest = {
  provider_event_id?: unknown;
  mapping_hint?: unknown;
  dry_run?: unknown;
};

type ProviderEvent = {
  id: string;
  clinic_id: string | null;
  provider: Provider;
  provider_event_id: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  processing_status: "received" | "processed" | "ignored" | "failed";
  received_at: string;
  payload: JsonObject;
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

const mappingTypes = [
  "phone_number",
  "assistant_id",
  "account_id",
  "messaging_profile_id",
  "webhook_secret_id",
  "other",
] as const;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isMappingType(value: string): value is MappingType {
  return mappingTypes.includes(value as MappingType);
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

  return cleanText(cursor);
}

function addCandidate(
  candidates: MappingCandidate[],
  mappingType: MappingType,
  providerIdentifier: string | null,
  source: string,
) {
  if (!providerIdentifier) return;

  const duplicate = candidates.some((candidate) =>
    candidate.mapping_type === mappingType &&
    candidate.provider_identifier === providerIdentifier
  );

  if (!duplicate) {
    candidates.push({
      mapping_type: mappingType,
      provider_identifier: providerIdentifier,
      source,
    });
  }
}

function getMappingHint(value: unknown): MappingCandidate | Response | null {
  if (value === undefined) return null;

  if (!isObject(value)) {
    return createErrorResponse(400, "Invalid mapping_hint", {
      code: "invalid_mapping_hint",
    });
  }

  const mappingType = cleanText(value.mapping_type);
  const providerIdentifier = cleanText(value.provider_identifier);

  if (!mappingType || !isMappingType(mappingType)) {
    return createErrorResponse(400, "Invalid mapping_hint.mapping_type", {
      code: "invalid_mapping_hint_mapping_type",
      allowed_values: mappingTypes,
    });
  }

  if (!providerIdentifier) {
    return createErrorResponse(
      400,
      "Invalid mapping_hint.provider_identifier",
      { code: "invalid_mapping_hint_provider_identifier" },
    );
  }

  return {
    mapping_type: mappingType,
    provider_identifier: providerIdentifier,
    source: "mapping_hint",
  };
}

function deriveTelnyxCandidates(payload: JsonObject) {
  const candidates: MappingCandidate[] = [];
  const dataPayload = nestedObject(nestedObject(payload, "data"), "payload");

  addCandidate(
    candidates,
    "phone_number",
    cleanText(dataPayload?.to),
    "payload.data.payload.to",
  );
  addCandidate(
    candidates,
    "phone_number",
    cleanText(dataPayload?.from),
    "payload.data.payload.from",
  );
  addCandidate(
    candidates,
    "messaging_profile_id",
    cleanText(dataPayload?.messaging_profile_id),
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

function deriveCandidates(providerEvent: ProviderEvent, mappingHint: MappingCandidate | null) {
  if (mappingHint) return [mappingHint];

  if (providerEvent.provider === "telnyx") {
    return deriveTelnyxCandidates(providerEvent.payload);
  }

  if (providerEvent.provider === "vapi") {
    return deriveVapiCandidates(providerEvent.payload);
  }

  return [];
}

function summarizeProviderEvent(providerEvent: Omit<ProviderEvent, "payload">) {
  return {
    id: providerEvent.id,
    clinic_id: providerEvent.clinic_id,
    provider: providerEvent.provider,
    provider_event_id: providerEvent.provider_event_id,
    event_type: providerEvent.event_type,
    resource_type: providerEvent.resource_type,
    resource_id: providerEvent.resource_id,
    processing_status: providerEvent.processing_status,
    received_at: providerEvent.received_at,
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

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let payload: MapProviderEventClinicRequest;
        try {
          payload = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body", {
            code: "invalid_json",
          });
        }

        const providerEventId = cleanText(payload.provider_event_id);
        if (!providerEventId || !uuidRegex.test(providerEventId)) {
          return createErrorResponse(400, "Invalid provider_event_id", {
            code: "invalid_provider_event_id",
          });
        }

        if (
          payload.dry_run !== undefined &&
          typeof payload.dry_run !== "boolean"
        ) {
          return createErrorResponse(400, "Invalid dry_run", {
            code: "invalid_dry_run",
          });
        }

        const mappingHint = getMappingHint(payload.mapping_hint);
        if (mappingHint instanceof Response) return mappingHint;

        const dryRun = typeof payload.dry_run === "boolean"
          ? payload.dry_run
          : false;

        // Admin access is intentional here: unmapped provider_events have
        // clinic_id = null and are hidden by normal clinic RLS. This function
        // is authenticated/internal and returns only summaries, not raw payload.
        const { data: providerEvent, error: providerEventError } =
          await supabaseAdmin
            .from("provider_events")
            .select(
              "id, clinic_id, provider, provider_event_id, event_type, resource_type, resource_id, processing_status, received_at, payload",
            )
            .eq("id", providerEventId)
            .single<ProviderEvent>();

        if (providerEventError || !providerEvent) {
          return createErrorResponse(404, "Provider event not found", {
            code: "provider_event_not_found",
          });
        }

        const providerEventSummary = summarizeProviderEvent(providerEvent);

        if (providerEvent.clinic_id) {
          return jsonResponse({
            status: "already_mapped",
            provider_event: providerEventSummary,
            matched_mapping: null,
            candidates_tried: [],
            dry_run: dryRun,
            updated: false,
          });
        }

        const candidates = deriveCandidates(providerEvent, mappingHint);
        if (candidates.length === 0) {
          return createErrorResponse(404, "Provider mapping not found", {
            code: "provider_mapping_not_found",
            provider_event: providerEventSummary,
            candidates_tried: candidates,
          });
        }

        let match: Awaited<ReturnType<typeof findMapping>>;
        try {
          match = await findMapping(providerEvent.provider, candidates);
        } catch (error) {
          console.error("Provider mapping lookup failed:", error);
          return createErrorResponse(500, "Provider mapping lookup failed", {
            code: "provider_mapping_lookup_failed",
          });
        }

        if (!match) {
          return createErrorResponse(404, "Provider mapping not found", {
            code: "provider_mapping_not_found",
            provider_event: providerEventSummary,
            candidates_tried: candidates,
          });
        }

        if (dryRun) {
          return jsonResponse({
            status: "matched",
            provider_event: providerEventSummary,
            matched_mapping: summarizeMapping(match.mapping),
            matched_candidate: match.candidate,
            candidates_tried: candidates,
            dry_run: true,
            updated: false,
          });
        }

        const { data: updatedProviderEvent, error: updateError } =
          await supabaseAdmin
            .from("provider_events")
            .update({ clinic_id: match.mapping.clinic_id })
            .eq("id", providerEvent.id)
            .select(
              "id, clinic_id, provider, provider_event_id, event_type, resource_type, resource_id, processing_status, received_at",
            )
            .single<Omit<ProviderEvent, "payload">>();

        if (updateError || !updatedProviderEvent) {
          console.error("Failed to map provider event to clinic:", updateError);
          return createErrorResponse(
            500,
            "Failed to map provider event to clinic",
            { code: "provider_event_mapping_failed" },
          );
        }

        return jsonResponse({
          status: "mapped",
          provider_event: summarizeProviderEvent(updatedProviderEvent),
          matched_mapping: summarizeMapping(match.mapping),
          matched_candidate: match.candidate,
          candidates_tried: candidates,
          dry_run: false,
          updated: true,
        });
      }),
    ),
  ),
);
