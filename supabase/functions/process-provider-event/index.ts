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

type ProviderEvent = {
  id: string;
  clinic_id: string | null;
  provider: "telnyx" | "vapi" | "system" | "manual";
  provider_event_id: string;
  event_type: string;
  processing_status: "received" | "processed" | "ignored" | "failed";
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

function isDuplicateIdempotencyKey(error: { code?: string; message?: string }) {
  return error.code === "23505" ||
    error.message?.includes("provider_event_attempts_idempotency_key_idx") ===
      true ||
    error.message?.includes("duplicate key value violates unique constraint") ===
      true;
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

        const { data: providerEvent, error: providerEventError } =
          await supabase
            .from("provider_events")
            .select(
              "id, clinic_id, provider, provider_event_id, event_type, processing_status",
            )
            .eq("id", providerEventId)
            .single<ProviderEvent>();

        if (providerEventError || !providerEvent) {
          return createErrorResponse(
            404,
            "Provider event not found or not accessible",
          );
        }

        if (!providerEvent.clinic_id) {
          return createErrorResponse(409, "Provider event is not mapped", {
            code: "unmapped_event",
          });
        }

        const idempotencyKey =
          `${providerEvent.provider}:${providerEvent.id}:${action}`;
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
                provider: providerEvent.provider,
                event_type: providerEvent.event_type,
                processing_status: providerEvent.processing_status,
              },
              attempt: existingAttempt,
            });
          }

          console.error("Failed to create provider processing attempt:", attemptError);
          return createErrorResponse(
            500,
            "Failed to create provider processing attempt",
          );
        }

        const finishedAt = new Date().toISOString();
        const result = classifySkeleton(providerEvent);

        try {
          const { data: updatedAttempt, error: updateAttemptError } =
            await supabaseAdmin
              .from("provider_event_processing_attempts")
              .update({
                status: "ignored",
                finished_at: finishedAt,
                result,
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
                processing_status: "ignored",
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
            status: "ignored",
            provider_event: updatedProviderEvent,
            attempt: updatedAttempt,
          });
        } catch (error) {
          const message = error instanceof Error
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
