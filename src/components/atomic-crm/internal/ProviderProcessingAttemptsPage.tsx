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

type ProviderProcessingAttempt = {
  id: string;
  provider_event_id: string;
  clinic_id: string | null;
  processor: string;
  action: string;
  status: "started" | "succeeded" | "failed" | "ignored";
  started_at: string;
  finished_at: string | null;
  idempotency_key: string | null;
  result: JsonValue | null;
  error_message: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Bratislava",
});

const statusLabels: Record<ProviderProcessingAttempt["status"], string> = {
  started: "Spustené",
  succeeded: "Úspešné",
  failed: "Zlyhalo",
  ignored: "Ignorované",
};

const statusVariants: Record<
  ProviderProcessingAttempt["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  started: "secondary",
  succeeded: "default",
  failed: "destructive",
  ignored: "outline",
};

const formatDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : "-";

const getResultPreview = (result: JsonValue | null) =>
  result === null ? "-" : JSON.stringify(result, null, 2);

export const ProviderProcessingAttemptsPage = () => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [attempts, setAttempts] = useState<ProviderProcessingAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttempts = async () => {
    setLoading(true);
    setError(null);

    const { data, error: attemptsError } = await supabase
      .from("provider_event_processing_attempts")
      .select(
        "id, provider_event_id, clinic_id, processor, action, status, started_at, finished_at, idempotency_key, result, error_message",
      )
      .order("started_at", { ascending: false })
      .limit(50);

    if (attemptsError) {
      setError(attemptsError.message);
      setAttempts([]);
    } else {
      setAttempts((data ?? []) as ProviderProcessingAttempt[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Interný debug pohľad
          </p>
          <h1 className="text-2xl font-semibold">
            Provider processing attempts
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Read-only prehľad budúcich pokusov o spracovanie provider eventov.
            Táto stránka nespúšťa procesory, nespracúva eventy a nevolá Telnyx,
            Vapi, Telegram ani OpenClaw.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadAttempts}
          disabled={loading}
          data-testid="provider-processing-attempts-refresh"
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Obnoviť
        </Button>
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
              <TableHead>Provider event</TableHead>
              <TableHead>Klinika</TableHead>
              <TableHead>Procesor</TableHead>
              <TableHead>Akcia</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>Začaté</TableHead>
              <TableHead>Dokončené</TableHead>
              <TableHead>Idempotency key</TableHead>
              <TableHead>Chyba</TableHead>
              <TableHead>Výsledok</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="provider-processing-attempts-table">
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  Načítavam pokusy o spracovanie...
                </TableCell>
              </TableRow>
            ) : attempts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  Žiadne pokusy o spracovanie provider eventov nie sú viditeľné
                  pre aktuálne prihlásenie.
                </TableCell>
              </TableRow>
            ) : (
              attempts.map((attempt) => (
                <TableRow
                  key={attempt.id}
                  data-testid="provider-processing-attempt-row"
                >
                  <TableCell className="max-w-56 whitespace-normal break-all font-mono text-xs">
                    {attempt.provider_event_id}
                  </TableCell>
                  <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                    {attempt.clinic_id ?? "unmapped"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {attempt.processor}
                  </TableCell>
                  <TableCell>{attempt.action}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[attempt.status]}>
                      {statusLabels[attempt.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(attempt.started_at)}</TableCell>
                  <TableCell>{formatDate(attempt.finished_at)}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal break-all font-mono text-xs">
                    {attempt.idempotency_key ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal break-words text-sm text-destructive">
                    {attempt.error_message ?? "-"}
                  </TableCell>
                  <TableCell>
                    <pre className="max-h-24 max-w-80 overflow-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
                      {getResultPreview(attempt.result)}
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
