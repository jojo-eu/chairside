import { useGetList, type RaRecord } from "ra-core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ChairsideActivity = {
  actor_type: "user" | "ai" | "system" | "patient";
  actor_id?: string | null;
  actor_label?: string | null;
  action: string;
  entity_type?: "appointment" | "patient" | "service" | "reminder" | string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
} & RaRecord;

const actionLabels: Record<string, string> = {
  "appointment.created": "Termín vytvorený",
  "reminder.sent": "Pripomienka odoslaná",
  "appointment.confirmed": "Termín potvrdený",
  "patient.created": "Pacient vytvorený",
  "appointment.needs_reschedule": "Termín vyžaduje presunutie",
  "service.updated": "Služba upravená",
  "patient.updated": "Pacient upravený",
};

const entityLabels: Record<string, string> = {
  appointment: "Termín",
  patient: "Pacient",
  service: "Služba",
  reminder: "Pripomienka",
};

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Bratislava",
});

const getStringDetail = (
  details: ChairsideActivity["details"],
  key: string,
) => {
  const value = details?.[key];

  return typeof value === "string" ? value : undefined;
};

const getDetailSummary = (activity: ChairsideActivity) => {
  const patientName = getStringDetail(activity.details, "patient_name");
  const serviceName = getStringDetail(activity.details, "service_name");
  const response = getStringDetail(activity.details, "response");
  const reason = getStringDetail(activity.details, "reason");
  const summary = getStringDetail(activity.details, "summary");
  const changedField = getStringDetail(activity.details, "changed_field");
  const source = getStringDetail(activity.details, "source");

  if (summary) {
    return summary;
  }

  if (reason) {
    return reason;
  }

  if (response) {
    return `Odpoveď: ${response}`;
  }

  if (changedField) {
    return `Upravené pole: ${changedField}`;
  }

  return [patientName, serviceName, source ? `Zdroj: ${source}` : undefined]
    .filter(Boolean)
    .join(" · ");
};

export const ChairsideActivityFeed = () => {
  const {
    data: activities = [],
    isPending,
    error,
  } = useGetList<ChairsideActivity>("chairside_activity_log", {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "created_at", order: "DESC" },
  });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">Aktivita</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {isPending ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Načítavam aktivitu...
          </p>
        ) : error ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Aktivitu sa nepodarilo načítať.
          </p>
        ) : activities.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Zatiaľ nie je zaznamenaná žiadna aktivita.
          </p>
        ) : (
          <div className="divide-y">
            {activities.map((activity) => {
              const detailSummary = getDetailSummary(activity);

              return (
                <div key={activity.id} className="space-y-1 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {actionLabels[activity.action] ?? activity.action}
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(activity.created_at))}
                    </time>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activity.actor_label ?? "-"} ·{" "}
                    {entityLabels[activity.entity_type ?? ""] ??
                      activity.entity_type ??
                      "-"}
                  </div>
                  {detailSummary ? (
                    <div className="text-sm">{detailSummary}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
