import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card } from "@/components/ui/card";
import type { Appointment } from "../types";

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Bratislava",
};

const statusLabels: Record<Appointment["status"], string> = {
  scheduled: "Naplánovaný",
  reminder_sent: "Pripomienka odoslaná",
  confirmed: "Potvrdený",
  cancelled: "Zrušený",
  needs_reschedule: "Vyžaduje presunutie",
  completed: "Dokončený",
  no_show: "Nedostavil sa",
};

const sourceLabels: Record<Appointment["source"], string> = {
  manual: "Ručne",
  ai_voice: "AI hovor",
  ai_sms: "AI SMS",
  imported: "Import",
};

export const AppointmentList = () => (
  <List<Appointment>
    title="Termíny"
    actions={false}
    perPage={25}
    sort={{ field: "starts_at", order: "ASC" }}
  >
    <Card className="p-0">
      <DataTable<Appointment>
        bulkActionButtons={false}
        storeKey="appointments.list"
      >
        <DataTable.Col<Appointment> source="patient_id" label="Pacient">
          <ReferenceField source="patient_id" reference="patients" link={false} />
        </DataTable.Col>
        <DataTable.Col<Appointment> source="service_id" label="Služba">
          <ReferenceField source="service_id" reference="services" link={false} />
        </DataTable.Col>
        <DataTable.Col<Appointment> source="starts_at" label="Začiatok">
          <DateField
            source="starts_at"
            locales="sk-SK"
            options={dateOptions}
            showTime
          />
        </DataTable.Col>
        <DataTable.Col<Appointment> source="ends_at" label="Koniec">
          <DateField
            source="ends_at"
            locales="sk-SK"
            options={dateOptions}
            showTime
          />
        </DataTable.Col>
        <DataTable.Col<Appointment>
          source="status"
          label="Stav"
          render={(appointment) => statusLabels[appointment.status]}
        />
        <DataTable.Col<Appointment>
          source="source"
          label="Zdroj"
          render={(appointment) => sourceLabels[appointment.source]}
        />
      </DataTable>
    </Card>
  </List>
);
