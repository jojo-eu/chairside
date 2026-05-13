import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { Card } from "@/components/ui/card";
import type { Patient } from "../types";

export const PatientList = () => (
  <List<Patient>
    title="Pacienti"
    actions={false}
    perPage={25}
    sort={{ field: "last_name", order: "ASC" }}
  >
    <Card className="p-0">
      <DataTable<Patient> bulkActionButtons={false} storeKey="patients.list">
        <DataTable.Col<Patient>
          source="last_name"
          label="Meno"
          render={(patient) =>
            `${patient.first_name} ${patient.last_name}`.trim()
          }
        />
        <DataTable.Col<Patient> source="phone" label="Telefón" />
        <DataTable.Col<Patient>
          source="last_visit_at"
          label="Posledná návšteva"
        >
          <DateField source="last_visit_at" empty="-" />
        </DataTable.Col>
        <DataTable.Col<Patient>
          source="do_not_contact"
          label="Nekontaktovať"
          render={(patient) => (patient.do_not_contact ? "Áno" : "Nie")}
        />
      </DataTable>
    </Card>
  </List>
);
