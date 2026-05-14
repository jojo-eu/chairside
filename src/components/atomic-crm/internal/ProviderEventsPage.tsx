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

type ProviderEvent = {
  id: string;
  clinic_id: string | null;
  provider: "telnyx" | "vapi" | "system" | "manual";
  provider_event_id: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  received_at: string;
  processed_at: string | null;
  processing_status: "received" | "processed" | "ignored" | "failed";
  payload: Record<string, unknown>;
};

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Bratislava",
});

const statusLabels: Record<ProviderEvent["processing_status"], string> = {
  received: "Prijaté",
  processed: "Spracované",
  ignored: "Ignorované",
  failed: "Zlyhalo",
};

const statusVariants: Record<
  ProviderEvent["processing_status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  received: "secondary",
  processed: "default",
  ignored: "outline",
  failed: "destructive",
};

const formatDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : "-";

const getPayloadPreview = (payload: Record<string, unknown>) =>
  JSON.stringify(payload, null, 2);

export const ProviderEventsPage = () => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [events, setEvents] = useState<ProviderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);

    const { data, error: eventsError } = await supabase
      .from("provider_events")
      .select(
        "id, clinic_id, provider, provider_event_id, event_type, resource_type, resource_id, received_at, processed_at, processing_status, payload",
      )
      .order("received_at", { ascending: false })
      .limit(50);

    if (eventsError) {
      setError(eventsError.message);
      setEvents([]);
    } else {
      setEvents((data ?? []) as ProviderEvent[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Interný debug pohľad
          </p>
          <h1 className="text-2xl font-semibold">Provider events</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Read-only prehľad prijatých provider eventov. Táto stránka
            nespracúva webhooky a nevolá Telnyx, Vapi, Telegram ani OpenClaw.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadEvents}
          disabled={loading}
          data-testid="provider-events-refresh"
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
              <TableHead>Provider</TableHead>
              <TableHead>Event ID</TableHead>
              <TableHead>Typ eventu</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>Prijaté</TableHead>
              <TableHead>Spracované</TableHead>
              <TableHead>Klinika</TableHead>
              <TableHead>Payload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="provider-events-table">
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  Načítavam eventy...
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  Žiadne provider eventy nie sú viditeľné pre aktuálne
                  prihlásenie.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id} data-testid="provider-event-row">
                  <TableCell>
                    <Badge variant="outline">{event.provider}</Badge>
                  </TableCell>
                  <TableCell className="max-w-60 whitespace-normal break-all font-mono text-xs">
                    {event.provider_event_id}
                  </TableCell>
                  <TableCell className="font-medium">
                    {event.event_type}
                  </TableCell>
                  <TableCell className="max-w-48 whitespace-normal break-all text-xs">
                    {event.resource_type ?? "-"}
                    {event.resource_id ? (
                      <span className="block font-mono text-muted-foreground">
                        {event.resource_id}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[event.processing_status]}>
                      {statusLabels[event.processing_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(event.received_at)}</TableCell>
                  <TableCell>{formatDate(event.processed_at)}</TableCell>
                  <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                    {event.clinic_id ?? "unmapped"}
                  </TableCell>
                  <TableCell>
                    <pre className="max-h-24 max-w-80 overflow-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
                      {getPayloadPreview(event.payload)}
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
