import { Fragment, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getSupabaseClient } from "../providers/supabase/supabase";

type MessageMetadata = Record<string, unknown>;

type InboundResponseMessage = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  reminder_id: string | null;
  direction: "inbound" | "outbound";
  channel: "sms" | "whatsapp" | "email";
  provider: "telnyx" | "manual" | "system" | null;
  provider_message_id: string | null;
  body: string;
  status: "pending" | "queued" | "sent" | "delivered" | "failed" | "received";
  received_at: string | null;
  created_at: string;
  metadata: MessageMetadata;
};

type InboundResponseContext = {
  patient: {
    name: string;
    phone: string | null;
  } | null;
  appointment: {
    starts_at: string | null;
  } | null;
  reminder: {
    status: string;
    response_status: string | null;
    response_received_at: string | null;
  } | null;
};

type StaffReviewRpcResult = {
  status?: string;
};

type ActionMessage = {
  kind: "success" | "info" | "warning" | "error";
  text: string;
} | null;

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Bratislava",
});

const formatDate = (value: string | null) =>
  value ? dateFormatter.format(new Date(value)) : "-";

const getMetadataString = (
  metadata: MessageMetadata,
  key: string,
): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const getMetadataBoolean = (metadata: MessageMetadata, key: string) => {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : null;
};

const getMetadataPreview = (metadata: MessageMetadata) =>
  JSON.stringify(metadata ?? {}, null, 2);

const isStaffReviewResolved = (message: InboundResponseMessage) =>
  getMetadataBoolean(message.metadata, "needs_staff_review") === true &&
  getMetadataString(message.metadata, "staff_review_status") === "resolved";

const requiresStaffReview = (message: InboundResponseMessage) =>
  getMetadataBoolean(message.metadata, "needs_staff_review") === true &&
  getMetadataString(message.metadata, "staff_review_status") !== "resolved";

const getActionMessageClassName = (
  kind: NonNullable<ActionMessage>["kind"],
) => {
  switch (kind) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "info":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
  }
};

export const InboundResponsesPage = () => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [messages, setMessages] = useState<InboundResponseMessage[]>([]);
  const [showOnlyReview, setShowOnlyReview] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [detailContext, setDetailContext] =
    useState<InboundResponseContext | null>(null);
  const [detailContextLoading, setDetailContextLoading] = useState(false);
  const [detailContextError, setDetailContextError] = useState<string | null>(
    null,
  );
  const [resolvingMessageId, setResolvingMessageId] = useState<string | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);
    setError(null);

    const { data, error: messagesError } = await supabase
      .from("messages")
      .select(
        "id, clinic_id, patient_id, appointment_id, reminder_id, direction, channel, provider, provider_message_id, body, status, received_at, created_at, metadata",
      )
      .eq("direction", "inbound")
      .not("reminder_id", "is", null)
      .not("provider_message_id", "is", null)
      .order("received_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (messagesError) {
      setError(messagesError.message);
      setMessages([]);
    } else {
      setMessages((data ?? []) as InboundResponseMessage[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reviewRowsCount = messages.filter(requiresStaffReview).length;
  const resolvedReviewRowsCount = messages.filter(isStaffReviewResolved).length;
  const visibleMessages = showOnlyReview
    ? messages.filter(requiresStaffReview)
    : messages;
  const selectedMessage =
    visibleMessages.find((message) => message.id === selectedMessageId) ?? null;

  useEffect(() => {
    let active = true;

    const loadDetailContext = async () => {
      setDetailContext(null);
      setDetailContextError(null);

      if (!selectedMessage) {
        setDetailContextLoading(false);
        return;
      }

      setDetailContextLoading(true);

      const [patientResult, appointmentResult, reminderResult] =
        await Promise.all([
          selectedMessage.patient_id
            ? supabase
                .from("patients")
                .select("first_name, last_name, phone")
                .eq("id", selectedMessage.patient_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          selectedMessage.appointment_id
            ? supabase
                .from("appointments")
                .select("starts_at")
                .eq("id", selectedMessage.appointment_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          selectedMessage.reminder_id
            ? supabase
                .from("reminders")
                .select("status, response_status, response_received_at")
                .eq("id", selectedMessage.reminder_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (!active) {
        return;
      }

      const errors = [
        patientResult.error?.message,
        appointmentResult.error?.message,
        reminderResult.error?.message,
      ].filter(Boolean);

      const patient = patientResult.data
        ? {
            name: [patientResult.data.first_name, patientResult.data.last_name]
              .filter(Boolean)
              .join(" "),
            phone: patientResult.data.phone ?? null,
          }
        : null;

      setDetailContext({
        patient,
        appointment: appointmentResult.data
          ? { starts_at: appointmentResult.data.starts_at ?? null }
          : null,
        reminder: reminderResult.data
          ? {
              status: reminderResult.data.status,
              response_status: reminderResult.data.response_status ?? null,
              response_received_at:
                reminderResult.data.response_received_at ?? null,
            }
          : null,
      });
      setDetailContextError(errors.length > 0 ? errors.join("; ") : null);
      setDetailContextLoading(false);
    };

    void loadDetailContext();

    return () => {
      active = false;
    };
  }, [selectedMessage, selectedMessageId, supabase]);

  const handleKeepExistingReview = async (message: InboundResponseMessage) => {
    setActionMessage(null);
    setResolvingMessageId(message.id);

    const { data, error: rpcError } = await supabase.rpc(
      "resolve_inbound_response_keep_existing",
      {
        p_inbound_message_id: message.id,
        p_expected_current_reminder_response_status:
          detailContext?.reminder?.response_status ?? null,
        p_staff_review_note: null,
      },
    );

    if (rpcError) {
      setActionMessage({
        kind: "error",
        text: `Review sa nepodarilo vyriešiť: ${rpcError.message}`,
      });
      setResolvingMessageId(null);
      return;
    }

    const result = data as StaffReviewRpcResult | null;
    const status = result?.status;

    if (status === "resolved") {
      setActionMessage({
        kind: "success",
        text: "Review bolo vyriešené: ponechaný existujúci stav pripomienky.",
      });
    } else if (status === "already_resolved") {
      setActionMessage({
        kind: "info",
        text: "Review už bolo vyriešené. Zoznam bol obnovený.",
      });
    } else if (status === "stale_reminder_state") {
      setActionMessage({
        kind: "warning",
        text: "Stav pripomienky sa medzitým zmenil. Zoznam bol obnovený.",
      });
    } else if (status === "not_found") {
      setActionMessage({
        kind: "error",
        text: "Inbound odpoveď alebo pripomienka nebola nájdená pre aktuálne prihlásenie.",
      });
    } else {
      setActionMessage({
        kind: "warning",
        text: `RPC vrátilo neočakávaný stav: ${status ?? "unknown"}.`,
      });
    }

    await loadMessages();
    setResolvingMessageId(null);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Interný debug pohľad
          </p>
          <h1 className="text-2xl font-semibold">Inbound reminder responses</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Read-only prehľad inbound provider správ naviazaných na pripomienky.
            Staff review akcie zatiaľ nie sú implementované; konfliktné
            opakované odpovede sú tu iba zobrazené, nie vyriešené.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadMessages}
          disabled={loading}
          data-testid="inbound-responses-refresh"
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Obnoviť
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Interný nástroj:</strong> stránka je iba na čítanie. Nerobí
        staff review, neposiela SMS odpovede, nevolá providerov a nezobrazuje
        raw payloady z <code>provider_events</code>.
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 text-sm md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-2 font-medium">
          <Switch
            checked={showOnlyReview}
            onCheckedChange={setShowOnlyReview}
            aria-label="Iba vyžaduje review"
            data-testid="inbound-responses-review-toggle"
          />
          Iba vyžaduje review
        </label>
        <div className="flex flex-wrap gap-2 text-muted-foreground">
          <Badge variant="outline">Načítané: {messages.length}</Badge>
          <Badge variant="outline">Vyžaduje review: {reviewRowsCount}</Badge>
          <Badge variant="outline">
            Vyriešené review: {resolvedReviewRowsCount}
          </Badge>
          <Badge variant="outline">Zobrazené: {visibleMessages.length}</Badge>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {actionMessage ? (
        <div
          role={actionMessage.kind === "error" ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${getActionMessageClassName(
            actionMessage.kind,
          )}`}
        >
          {actionMessage.text}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Detail</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Provider message ID</TableHead>
              <TableHead>Text</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>Prijaté</TableHead>
              <TableHead>Parsed</TableHead>
              <TableHead>Repeat</TableHead>
              <TableHead>Predošlý stav</TableHead>
              <TableHead>Repeat outcome</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Staff status</TableHead>
              <TableHead>Staff outcome</TableHead>
              <TableHead>Matched outbound</TableHead>
              <TableHead>Reminder</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Appointment</TableHead>
              <TableHead>Klinika</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="inbound-responses-table">
            {loading ? (
              <TableRow>
                <TableCell colSpan={19} className="text-muted-foreground">
                  Načítavam inbound odpovede...
                </TableCell>
              </TableRow>
            ) : visibleMessages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={19} className="text-muted-foreground">
                  {showOnlyReview
                    ? "Žiadne inbound odpovede vyžadujúce review nie sú viditeľné pre aktuálne prihlásenie."
                    : "Žiadne inbound odpovede naviazané na pripomienky nie sú viditeľné pre aktuálne prihlásenie."}
                </TableCell>
              </TableRow>
            ) : (
              visibleMessages.map((message) => {
                const parsedResponse = getMetadataString(
                  message.metadata,
                  "parsed_response",
                );
                const repeatResponse = getMetadataBoolean(
                  message.metadata,
                  "repeat_response",
                );
                const previousResponseStatus = getMetadataString(
                  message.metadata,
                  "previous_response_status",
                );
                const repeatOutcome = getMetadataString(
                  message.metadata,
                  "repeat_outcome",
                );
                const needsStaffReview =
                  getMetadataBoolean(message.metadata, "needs_staff_review") ??
                  false;
                const reviewResolved = isStaffReviewResolved(message);
                const requiresReview = requiresStaffReview(message);
                const matchedOutbound = getMetadataString(
                  message.metadata,
                  "matched_outbound_message_id",
                );
                const staffReviewStatus = getMetadataString(
                  message.metadata,
                  "staff_review_status",
                );
                const staffReviewOutcome = getMetadataString(
                  message.metadata,
                  "staff_review_outcome",
                );
                const staffReviewedAt = getMetadataString(
                  message.metadata,
                  "staff_reviewed_at",
                );
                const staffReviewedBy = getMetadataString(
                  message.metadata,
                  "staff_reviewed_by",
                );
                const staffReviewNote = getMetadataString(
                  message.metadata,
                  "staff_review_note",
                );
                const previousReminderResponseStatus = getMetadataString(
                  message.metadata,
                  "previous_reminder_response_status",
                );
                const newReminderResponseStatus = getMetadataString(
                  message.metadata,
                  "new_reminder_response_status",
                );

                return (
                  <Fragment key={message.id}>
                    <TableRow
                      data-testid="inbound-response-row"
                      className={requiresReview ? "bg-amber-50/60" : undefined}
                    >
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-pressed={selectedMessageId === message.id}
                          onClick={() =>
                            setSelectedMessageId((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                        >
                          {selectedMessageId === message.id
                            ? "Skryť detail"
                            : "Zobraziť detail"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {message.provider ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-all font-mono text-xs">
                        {message.provider_message_id}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal break-words">
                        {message.body}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{message.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(message.received_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{parsedResponse ?? "-"}</Badge>
                      </TableCell>
                      <TableCell>{repeatResponse ? "Áno" : "Nie"}</TableCell>
                      <TableCell>{previousResponseStatus ?? "-"}</TableCell>
                      <TableCell>{repeatOutcome ?? "-"}</TableCell>
                      <TableCell>
                        {requiresReview ? (
                          <Badge variant="destructive">Vyžaduje review</Badge>
                        ) : reviewResolved ? (
                          <Badge variant="secondary">Vyriešené review</Badge>
                        ) : (
                          <Badge variant="outline">Nie</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {staffReviewStatus ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {staffReviewOutcome ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                        {matchedOutbound ?? "-"}
                      </TableCell>
                      <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                        {message.reminder_id}
                      </TableCell>
                      <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                        {message.patient_id}
                      </TableCell>
                      <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                        {message.appointment_id}
                      </TableCell>
                      <TableCell className="max-w-52 whitespace-normal break-all font-mono text-xs">
                        {message.clinic_id}
                      </TableCell>
                      <TableCell>
                        <pre className="max-h-24 max-w-80 overflow-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
                          {getMetadataPreview(message.metadata)}
                        </pre>
                      </TableCell>
                    </TableRow>
                    {selectedMessageId === message.id ? (
                      <TableRow data-testid="inbound-response-detail-row">
                        <TableCell colSpan={19} className="bg-muted/20 p-4">
                          <div
                            className="space-y-4 rounded-lg border bg-background p-4"
                            data-testid="inbound-response-detail"
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h2 className="text-lg font-semibold">
                                  Detail inbound odpovede
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                  Dostupná je iba akcia ponechať existujúci
                                  stav. Accept/update reminder akcie zatiaľ nie
                                  sú implementované.
                                </p>
                              </div>
                              {requiresReview ? (
                                <Badge variant="destructive">
                                  Vyžaduje review
                                </Badge>
                              ) : reviewResolved ? (
                                <Badge variant="secondary">
                                  Vyriešené review
                                </Badge>
                              ) : (
                                <Badge variant="outline">Bez review</Badge>
                              )}
                            </div>

                            {requiresReview ? (
                              <div className="rounded-lg border bg-muted/20 p-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div className="text-sm text-muted-foreground">
                                    Táto akcia zavolá RPC a ponechá aktuálny
                                    `reminder.response_status` bez priameho
                                    zápisu z UI.
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      void handleKeepExistingReview(message)
                                    }
                                    disabled={
                                      resolvingMessageId === message.id ||
                                      detailContextLoading ||
                                      !detailContext?.reminder
                                    }
                                  >
                                    {resolvingMessageId === message.id
                                      ? "Ukladám..."
                                      : "Ponechať existujúci stav"}
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                              {[
                                ["patient name", detailContext?.patient?.name],
                                [
                                  "patient phone",
                                  detailContext?.patient?.phone,
                                ],
                                [
                                  "appointments.starts_at",
                                  formatDate(
                                    detailContext?.appointment?.starts_at ??
                                      null,
                                  ),
                                ],
                                [
                                  "reminder status",
                                  detailContext?.reminder?.status,
                                ],
                                [
                                  "reminder response_status",
                                  detailContext?.reminder?.response_status,
                                ],
                                [
                                  "reminder response_received_at",
                                  formatDate(
                                    detailContext?.reminder
                                      ?.response_received_at ?? null,
                                  ),
                                ],
                                [
                                  "provider_message_id",
                                  message.provider_message_id,
                                ],
                                ["body/text", message.body],
                                ["parsed_response", parsedResponse],
                                [
                                  "repeat_response",
                                  repeatResponse ? "true" : "false",
                                ],
                                [
                                  "previous_response_status",
                                  previousResponseStatus,
                                ],
                                ["repeat_outcome", repeatOutcome],
                                [
                                  "needs_staff_review",
                                  needsStaffReview ? "true" : "false",
                                ],
                                [
                                  "matched_outbound_message_id",
                                  matchedOutbound,
                                ],
                                ["staff_review_status", staffReviewStatus],
                                ["staff_review_outcome", staffReviewOutcome],
                                [
                                  "staff_reviewed_at",
                                  formatDate(staffReviewedAt),
                                ],
                                ["staff_reviewed_by", staffReviewedBy],
                                ["staff_review_note", staffReviewNote],
                                [
                                  "previous_reminder_response_status",
                                  previousReminderResponseStatus,
                                ],
                                [
                                  "new_reminder_response_status",
                                  newReminderResponseStatus,
                                ],
                                ["reminder_id", message.reminder_id],
                                ["patient_id", message.patient_id],
                                ["appointment_id", message.appointment_id],
                                ["clinic_id", message.clinic_id],
                              ].map(([label, value]) => (
                                <div key={label} className="space-y-1">
                                  <div className="text-xs font-medium uppercase text-muted-foreground">
                                    {label}
                                  </div>
                                  <div className="whitespace-pre-wrap break-all font-mono text-xs">
                                    {value ?? "-"}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {detailContextLoading ? (
                              <p className="text-sm text-muted-foreground">
                                Načítavam kontext pacienta, termínu a
                                pripomienky...
                              </p>
                            ) : null}

                            {detailContextError ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                                Kontext sa nepodarilo načítať úplne:{" "}
                                {detailContextError}
                              </div>
                            ) : null}

                            <div className="space-y-1">
                              <div className="text-xs font-medium uppercase text-muted-foreground">
                                Full metadata JSON
                              </div>
                              <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
                                {getMetadataPreview(message.metadata)}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
