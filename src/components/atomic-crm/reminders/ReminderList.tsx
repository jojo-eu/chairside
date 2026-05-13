import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card } from "@/components/ui/card";
import type { Appointment, Reminder } from "../types";

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Bratislava",
};

const dateFormatter = new Intl.DateTimeFormat("sk-SK", dateOptions);

const statusLabels: Record<Reminder["status"], string> = {
  pending: "Čaká",
  sent: "Odoslaná",
  delivered: "Doručená",
  failed: "Zlyhalo",
  responded: "Odpovedané",
  cancelled: "Zrušená",
};

const responseLabels: Record<
  NonNullable<Reminder["response_status"]>,
  string
> = {
  confirmed: "Potvrdené",
  declined: "Odmietnuté",
  opted_out: "Nekontaktovať",
  needs_review: "Na kontrolu",
};

const channelLabels: Record<Reminder["channel"], string> = {
  sms: "SMS",
  voice: "Hovor",
};

export const ReminderList = () => (
  <List<Reminder>
    title="Pripomienky"
    actions={false}
    perPage={25}
    sort={{ field: "scheduled_for", order: "ASC" }}
  >
    <Card className="p-0">
      <DataTable<Reminder> bulkActionButtons={false} storeKey="reminders.list">
        <DataTable.Col<Reminder> source="patient_id" label="Pacient">
          <ReferenceField source="patient_id" reference="patients" link={false} />
        </DataTable.Col>
        <DataTable.Col<Reminder> source="appointment_id" label="Termín">
          <ReferenceField<Reminder, Appointment>
            source="appointment_id"
            reference="appointments"
            link={false}
            render={({ referenceRecord }) =>
              referenceRecord
                ? dateFormatter.format(new Date(referenceRecord.starts_at))
                : "-"
            }
          />
        </DataTable.Col>
        <DataTable.Col<Reminder>
          source="scheduled_for"
          label="Naplánované na"
        >
          <DateField
            source="scheduled_for"
            locales="sk-SK"
            options={dateOptions}
            showTime
          />
        </DataTable.Col>
        <DataTable.Col<Reminder>
          source="channel"
          label="Kanál"
          render={(reminder) => channelLabels[reminder.channel]}
        />
        <DataTable.Col<Reminder>
          source="status"
          label="Stav"
          render={(reminder) => statusLabels[reminder.status]}
        />
        <DataTable.Col<Reminder>
          source="response_status"
          label="Odpoveď"
          render={(reminder) =>
            reminder.response_status
              ? responseLabels[reminder.response_status]
              : "-"
          }
        />
        <DataTable.Col<Reminder> source="template_key" label="Šablóna" />
      </DataTable>
    </Card>
  </List>
);
