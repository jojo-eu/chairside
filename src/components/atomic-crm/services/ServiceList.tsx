import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { Card } from "@/components/ui/card";
import type { Service } from "../types";

export const ServiceList = () => (
  <List<Service>
    resource="services"
    title="Služby"
    actions={false}
    perPage={25}
    sort={{ field: "display_order", order: "ASC" }}
  >
    <Card className="p-0">
      <DataTable<Service> bulkActionButtons={false} storeKey="services.list">
        <DataTable.Col<Service> source="name" label="Názov" />
        <DataTable.Col<Service>
          source="duration_minutes"
          label="Trvanie"
          render={(service) => `${service.duration_minutes} min`}
        />
        <DataTable.Col<Service>
          source="buffer_minutes"
          label="Buffer"
          render={(service) => `${service.buffer_minutes} min`}
        />
        <DataTable.Col<Service>
          source="active"
          label="Aktívna"
          render={(service) => (service.active ? "Áno" : "Nie")}
        />
        <DataTable.Col<Service> source="display_order" label="Poradie" />
      </DataTable>
    </Card>
  </List>
);
