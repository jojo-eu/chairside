import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

type JsonObject = Record<string, unknown>;

type ProviderEventStatus = "received" | "duplicate";
type VapiAuthMetadata =
  | {
    required: false;
    skipped: true;
    mode: "none";
    reason: "missing_vapi_webhook_auth";
  }
  | {
    required: true;
    verified: true;
    mode: "bearer_token" | "shared_secret";
  }
  | {
    required: true;
    verified: false;
    mode: "bearer_token" | "shared_secret";
    reason: "invalid_or_missing";
  }
  | {
    required: true;
    verified: false;
    mode: "signing_secret";
    reason: "not_implemented";
    headers_present: boolean;
  };

type VapiAuthResult =
  | { ok: true; metadata: VapiAuthMetadata }
  | {
    ok: false;
    status: number;
    message: string;
    code: string;
    metadata: VapiAuthMetadata;
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
  const message = nestedObject(payload, "message");
  const call = nestedObject(payload, "call");

  return stringValue(message?.id) ??
    stringValue(payload.event_id) ??
    stringValue(payload.id) ??
    stringValue(call?.id);
}

function extractEventType(payload: JsonObject) {
  const message = nestedObject(payload, "message");

  return stringValue(message?.type) ??
    stringValue(payload.type) ??
    stringValue(payload.event_type) ??
    "unknown";
}

function extractResourceType(payload: JsonObject) {
  const message = nestedObject(payload, "message");

  return stringValue(message?.type) ??
    stringValue(payload.resource_type) ??
    "call";
}

function extractResourceId(payload: JsonObject) {
  const call = nestedObject(payload, "call");
  const message = nestedObject(payload, "message");
  const messageCall = isObject(message?.call) ? message.call : null;

  return stringValue(call?.id) ??
    stringValue(messageCall?.id) ??
    stringValue(payload.resource_id);
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

function getEnvValue(name: string) {
  const value = Deno.env.get(name)?.trim();

  return value && value.length > 0 ? value : null;
}

function getVapiAuthConfig() {
  return {
    // Strict precedence: HMAC-style signing secret first, then bearer token,
    // then legacy shared secret. This avoids accepting a weaker configured
    // mode when a stronger verification boundary was requested.
    signingSecret: getEnvValue("VAPI_WEBHOOK_SIGNING_SECRET"),
    bearerToken: getEnvValue("VAPI_WEBHOOK_BEARER_TOKEN"),
    sharedSecret: getEnvValue("VAPI_WEBHOOK_SECRET"),
  };
}

function getVapiAuthHeaders(req: Request) {
  return {
    authorization: req.headers.get("Authorization"),
    sharedSecret: req.headers.get("X-Vapi-Secret") ??
      req.headers.get("x-vapi-secret"),
    signature: req.headers.get("X-Vapi-Signature") ??
      req.headers.get("x-vapi-signature"),
    timestamp: req.headers.get("X-Vapi-Timestamp") ??
      req.headers.get("x-vapi-timestamp"),
  };
}

function verifyVapiWebhookBoundary(
  req: Request,
  rawBody: string,
): VapiAuthResult {
  const config = getVapiAuthConfig();

  if (config.signingSecret) {
    const authHeaders = getVapiAuthHeaders(req);
    const headersPresent = Boolean(
      authHeaders.signature && authHeaders.timestamp,
    );

    if (!headersPresent) {
      return {
        ok: false,
        status: 401,
        message: "Missing Vapi signature headers",
        code: "vapi_signature_missing",
        metadata: {
          required: true,
          verified: false,
          mode: "signing_secret",
          reason: "not_implemented",
          headers_present: false,
        },
      };
    }

    // TODO: Implement exact Vapi HMAC-style verification against the configured
    // Custom Credentials/signature docs before production use. The raw request
    // body is preserved here because signature verification must use the exact
    // original body. Until the exact algorithm is implemented and tested, fail
    // closed whenever VAPI_WEBHOOK_SIGNING_SECRET is configured.
    void rawBody;
    return {
      ok: false,
      status: 501,
      message: "Vapi signature verification is not implemented",
      code: "vapi_signature_verification_not_implemented",
      metadata: {
        required: true,
        verified: false,
        mode: "signing_secret",
        reason: "not_implemented",
        headers_present: true,
      },
    };
  }

  if (config.bearerToken) {
    const expectedAuthorization = `Bearer ${config.bearerToken}`;
    const authorization = getVapiAuthHeaders(req).authorization;

    if (authorization !== expectedAuthorization) {
      return {
        ok: false,
        status: 401,
        message: "Invalid Vapi bearer token",
        code: "vapi_bearer_token_invalid",
        metadata: {
          required: true,
          verified: false,
          mode: "bearer_token",
          reason: "invalid_or_missing",
        },
      };
    }

    return {
      ok: true,
      metadata: {
        required: true,
        verified: true,
        mode: "bearer_token",
      },
    };
  }

  if (config.sharedSecret) {
    const sharedSecret = getVapiAuthHeaders(req).sharedSecret;

    if (sharedSecret !== config.sharedSecret) {
      return {
        ok: false,
        status: 401,
        message: "Invalid Vapi shared secret",
        code: "vapi_shared_secret_invalid",
        metadata: {
          required: true,
          verified: false,
          mode: "shared_secret",
          reason: "invalid_or_missing",
        },
      };
    }

    return {
      ok: true,
      metadata: {
        required: true,
        verified: true,
        mode: "shared_secret",
      },
    };
  }

  console.warn(
    "Vapi webhook authentication skipped: no Vapi webhook auth env var is configured.",
  );
  return {
    ok: true,
    metadata: {
      required: false,
      skipped: true,
      mode: "none",
      reason: "missing_vapi_webhook_auth",
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

    const authVerification = verifyVapiWebhookBoundary(req, rawBody);
    if (!authVerification.ok) {
      return createErrorResponse(
        authVerification.status,
        authVerification.message,
        {
          code: authVerification.code,
          auth_verification: authVerification.metadata,
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

    // TODO: Verify the real Vapi webhook signature before production use.
    // This skeleton stores raw fake/test events only and does not trust payload
    // fields for business actions.
    const eventType = extractEventType(payload);
    const providerEventId = extractProviderEventId(payload) ??
      getFallbackProviderEventId(eventType);
    const resourceType = extractResourceType(payload);
    const resourceId = extractResourceId(payload);

    const { data: providerEvent, error } = await supabaseAdmin
      .from("provider_events")
      .insert({
        clinic_id: null,
        provider: "vapi",
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
          provider: "vapi",
          provider_event_id: providerEventId,
          event_type: eventType,
          auth_verification: authVerification.metadata,
        });
      }

      console.error("Failed to store Vapi provider event:", error);
      return createErrorResponse(500, "Failed to store provider event");
    }

    return jsonResponse({
      status: "received" satisfies ProviderEventStatus,
      provider_event: providerEvent,
      auth_verification: authVerification.metadata,
    });
  })
);
