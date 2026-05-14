import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type JsonObject = Record<string, unknown>;

type ProviderEventStatus = "received" | "duplicate";
type SignatureVerificationMetadata =
  | {
    required: false;
    skipped: true;
    reason: "missing_signing_secret";
  }
  | {
    required: true;
    verified: false;
    reason: "not_implemented";
    headers_present: boolean;
  };

type SignatureVerificationResult =
  | { ok: true; metadata: SignatureVerificationMetadata }
  | {
    ok: false;
    status: number;
    message: string;
    code: string;
    metadata: SignatureVerificationMetadata;
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

function getTelnyxSigningSecret() {
  const secret = Deno.env.get("TELNYX_WEBHOOK_SIGNING_SECRET")?.trim();

  return secret && secret.length > 0 ? secret : null;
}

function getTelnyxSignatureHeaders(req: Request) {
  return {
    signature: req.headers.get("telnyx-signature-ed25519") ??
      req.headers.get("x-telnyx-signature-ed25519") ??
      req.headers.get("telnyx-signature") ??
      req.headers.get("x-telnyx-signature"),
    timestamp: req.headers.get("telnyx-timestamp") ??
      req.headers.get("x-telnyx-timestamp"),
  };
}

function verifyTelnyxSignatureBoundary(
  req: Request,
  rawBody: string,
): SignatureVerificationResult {
  const signingSecret = getTelnyxSigningSecret();

  if (!signingSecret) {
    console.warn(
      "Telnyx webhook signature verification skipped: TELNYX_WEBHOOK_SIGNING_SECRET is not configured.",
    );
    return {
      ok: true,
      metadata: {
        required: false,
        skipped: true,
        reason: "missing_signing_secret",
      },
    };
  }

  const signatureHeaders = getTelnyxSignatureHeaders(req);
  const headersPresent = Boolean(
    signatureHeaders.signature && signatureHeaders.timestamp,
  );

  if (!headersPresent) {
    return {
      ok: false,
      status: 401,
      message: "Missing Telnyx signature headers",
      code: "telnyx_signature_missing",
      metadata: {
        required: true,
        verified: false,
        reason: "not_implemented",
        headers_present: false,
      },
    };
  }

  // TODO: Implement exact Telnyx signature verification against Telnyx docs
  // before production use. The raw request body is preserved here because
  // signature verification must be performed over the original bytes/string.
  // Until the exact algorithm is implemented and tested, fail closed whenever
  // TELNYX_WEBHOOK_SIGNING_SECRET is configured.
  void rawBody;
  return {
    ok: false,
    status: 501,
    message: "Telnyx signature verification is not implemented",
    code: "telnyx_signature_verification_not_implemented",
    metadata: {
      required: true,
      verified: false,
      reason: "not_implemented",
      headers_present: true,
    },
  };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return createErrorResponse(400, "Unable to read request body");
    }

    const signatureVerification = verifyTelnyxSignatureBoundary(req, rawBody);
    if (!signatureVerification.ok) {
      return createErrorResponse(
        signatureVerification.status,
        signatureVerification.message,
        {
          code: signatureVerification.code,
          signature_verification: signatureVerification.metadata,
        },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
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
          signature_verification: signatureVerification.metadata,
        });
      }

      console.error("Failed to store Telnyx provider event:", error);
      return createErrorResponse(500, "Failed to store provider event");
    }

    return jsonResponse({
      status: "received" satisfies ProviderEventStatus,
      provider_event: providerEvent,
      signature_verification: signatureVerification.metadata,
    });
  })
);
