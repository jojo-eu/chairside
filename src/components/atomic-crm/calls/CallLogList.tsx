import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card } from "@/components/ui/card";
import type { CallLog } from "../types";

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Bratislava",
};

const statusLabels: Record<CallLog["status"], string> = {
  started: "Začatý",
  completed: "Dokončený",
  failed: "Zlyhal",
  missed: "Zmeškaný",
};

const outcomeLabels: Record<CallLog["outcome"], string> = {
  booked: "Rezervácia",
  needs_reschedule: "Vyžaduje presunutie",
  cancelled: "Zrušené",
  answered_question: "Zodpovedaná otázka",
  no_action: "Bez akcie",
  failed: "Zlyhalo",
  unknown: "Neznáme",
};

const providerLabels: Record<CallLog["provider"], string> = {
  vapi: "Vapi",
  telnyx: "Telnyx",
  manual: "Ručne",
  system: "Systém",
};

const formatDuration = (durationSeconds?: number | null) => {
  if (durationSeconds == null) {
    return "-";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
};

export const CallLogList = () => (
  <List<CallLog>
    resource="call_logs"
    title="Hovory"
    actions={false}
    perPage={25}
    sort={{ field: "started_at", order: "DESC" }}
  >
    <Card className="p-0">
      <DataTable<CallLog> bulkActionButtons={false} storeKey="call_logs.list">
        <DataTable.Col<CallLog> source="patient_id" label="Pacient / telefón">
          <ReferenceField
            source="patient_id"
            reference="patients"
            link={false}
            empty="-"
          />
        </DataTable.Col>
        <DataTable.Col<CallLog> source="phone" label="Telefón" />
        <DataTable.Col<CallLog> source="started_at" label="Začiatok">
          <DateField
            source="started_at"
            locales="sk-SK"
            options={dateOptions}
            showTime
          />
        </DataTable.Col>
        <DataTable.Col<CallLog>
          source="duration_seconds"
          label="Trvanie"
          render={(callLog) => formatDuration(callLog.duration_seconds)}
        />
        <DataTable.Col<CallLog>
          source="status"
          label="Stav"
          render={(callLog) => statusLabels[callLog.status]}
        />
        <DataTable.Col<CallLog>
          source="outcome"
          label="Výsledok"
          render={(callLog) => outcomeLabels[callLog.outcome]}
        />
        <DataTable.Col<CallLog>
          source="provider"
          label="Poskytovateľ"
          render={(callLog) => providerLabels[callLog.provider]}
        />
        <DataTable.Col<CallLog>
          source="needs_review"
          label="Vyžaduje kontrolu"
          render={(callLog) => (callLog.needs_review ? "Áno" : "Nie")}
        />
        <DataTable.Col<CallLog>
          source="summary"
          label="Súhrn"
          render={(callLog) => callLog.summary ?? "-"}
        />
      </DataTable>
    </Card>
  </List>
);
