import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getSupabaseClient } from "../providers/supabase/supabase";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ProviderMapping = {
  id: string;
  clinic_id: string;
  provider: "telnyx" | "vapi" | "system" | "manual";
  mapping_type:
    | "phone_number"
    | "assistant_id"
    | "account_id"
    | "messaging_profile_id"
    | "webhook_secret_id"
    | "other";
  provider_identifier: string;
  label: string | null;
  active: boolean;
  metadata: JsonValue;
  created_at: string;
  updated_at: string;
};

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Bratislava",
});

const mappingTypeLabels: Record<ProviderMapping["mapping_type"], string> = {
  phone_number: "Telefónne číslo",
  assistant_id: "Assistant ID",
  account_id: "Account ID",
  messaging_profile_id: "Messaging profile",
  webhook_secret_id: "Webhook secret referencia",
  other: "Iné",
};

const formatDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : "-";

const getMetadataPreview = (metadata: JsonValue) =>
  JSON.stringify(metadata, null, 2);

export const ProviderMappingsPage = () => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [mappings, setMappings] = useState<ProviderMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMappings = async () => {
    setLoading(true);
    setError(null);

    const { data, error: mappingsError } = await supabase
      .from("provider_mappings")
      .select(
        "id, clinic_id, provider, mapping_type, provider_identifier, label, active, metadata, created_at, updated_at",
      )
      .order("provider", { ascending: true })
      .order("mapping_type", { ascending: true })
      .order("provider_identifier", { ascending: true })
      .limit(100);

    if (mappingsError) {
      setError(mappingsError.message);
      setMappings([]);
    } else {
      setMappings((data ?? []) as ProviderMapping[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Interný debug pohľad
          </p>
          <h1 className="text-2xl font-semibold">Provider mappings</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Read-only prehľad mapovaní provider identifikátorov na kliniky.
            Táto stránka nespracúva eventy, nemení konfiguráciu a nevolá
            Telnyx, Vapi, Telegram ani OpenClaw.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadMappings}
          disabled={loading}
          data-testid="provider-mappings-refresh"
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Obnoviť
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Bezpečnostná poznámka:</strong> mapping typu{" "}
        <code>webhook_secret_id</code> je iba referencia alebo názov. Nesmie
        obsahovať skutočnú hodnotu provider secretu.
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Typ mapovania</TableHead>
              <TableHead>Identifikátor</TableHead>
              <TableHead>Popis</TableHead>
              <TableHead>Aktívne</TableHead>
              <TableHead>Klinika</TableHead>
              <TableHead>Vytvorené</TableHead>
              <TableHead>Upravené</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="provider-mappings-table">
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  Načítavam provider mappings...
                </TableCell>
              </TableRow>
            ) : mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  Žiadne provider mappings nie sú viditeľné pre aktuálne
                  prihlásenie.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow key={mapping.id} data-testid="provider-mapping-row">
                  <TableCell>
                    <Badge variant="outline">{mapping.provider}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {mappingTypeLabels[mapping.mapping_type]}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {mapping.mapping_type}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal break-all font-mono text-xs">
                    {mapping.provider_identifier}
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal break-words">
                    {mapping.label ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={mapping.active ? "default" : "secondary"}>
                      {mapping.active ? "Áno" : "Nie"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                    {mapping.clinic_id}
                  </TableCell>
                  <TableCell>{formatDate(mapping.created_at)}</TableCell>
                  <TableCell>{formatDate(mapping.updated_at)}</TableCell>
                  <TableCell>
                    <pre className="max-h-24 max-w-80 overflow-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
                      {getMetadataPreview(mapping.metadata)}
                    </pre>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
