import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { createErrorResponse } from "../_shared/utils.ts";

const providers = ["telnyx", "vapi", "system", "manual"] as const;
const mappingTypes = [
  "phone_number",
  "assistant_id",
  "account_id",
  "messaging_profile_id",
  "webhook_secret_id",
  "other",
] as const;

type Provider = (typeof providers)[number];
type MappingType = (typeof mappingTypes)[number];

type LookupProviderMappingRequest = {
  provider?: unknown;
  mapping_type?: unknown;
  provider_identifier?: unknown;
  active_only?: unknown;
};

type ProviderMapping = {
  id: string;
  clinic_id: string;
  provider: Provider;
  mapping_type: MappingType;
  provider_identifier: string;
  label: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isProvider(value: string): value is Provider {
  return providers.includes(value as Provider);
}

function isMappingType(value: string): value is MappingType {
  return mappingTypes.includes(value as MappingType);
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let payload: LookupProviderMappingRequest;
        try {
          payload = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body", {
            code: "invalid_json",
          });
        }

        const provider = cleanText(payload.provider);
        const mappingType = cleanText(payload.mapping_type);
        const providerIdentifier = cleanText(payload.provider_identifier);

        if (!isProvider(provider)) {
          return createErrorResponse(400, "Invalid provider", {
            code: "invalid_provider",
            allowed_values: providers,
          });
        }

        if (!isMappingType(mappingType)) {
          return createErrorResponse(400, "Invalid mapping_type", {
            code: "invalid_mapping_type",
            allowed_values: mappingTypes,
          });
        }

        if (!providerIdentifier) {
          return createErrorResponse(400, "Invalid provider_identifier", {
            code: "invalid_provider_identifier",
          });
        }

        if (
          payload.active_only !== undefined &&
          typeof payload.active_only !== "boolean"
        ) {
          return createErrorResponse(400, "Invalid active_only", {
            code: "invalid_active_only",
          });
        }

        const activeOnly = typeof payload.active_only === "boolean"
          ? payload.active_only
          : true;
        const authHeader = req.headers.get("Authorization") ?? "";
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );

        // webhook_secret_id values are reference identifiers only. Never store
        // or return raw provider secret values from provider_mappings.
        let query = supabase
          .from("provider_mappings")
          .select(
            "id, clinic_id, provider, mapping_type, provider_identifier, label, active, metadata",
          )
          .eq("provider", provider)
          .eq("mapping_type", mappingType)
          .eq("provider_identifier", providerIdentifier);

        if (activeOnly) {
          query = query.eq("active", true);
        }

        const { data, error } = await query
          .limit(1)
          .returns<ProviderMapping[]>();

        if (error) {
          console.error("Provider mapping lookup failed:", error);
          return createErrorResponse(500, "Provider mapping lookup failed", {
            code: "provider_mapping_lookup_failed",
          });
        }

        const mapping = data?.[0];
        if (!mapping) {
          return createErrorResponse(404, "Provider mapping not found", {
            code: "provider_mapping_not_found",
          });
        }

        return jsonResponse({
          mapping,
          active_only: activeOnly,
        });
      }),
    ),
  ),
);
