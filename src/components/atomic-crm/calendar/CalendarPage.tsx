import { useMemo } from "react";
import { useGetList, useGetManyAggregate, type Identifier } from "ra-core";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { Appointment, Patient, Service } from "../types";

const timeZone = "Europe/Bratislava";

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "full",
  timeZone,
});

const timeFormatter = new Intl.DateTimeFormat("sk-SK", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone,
});

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

const getUniqueIds = (ids: Identifier[]) => Array.from(new Set(ids));

const getPatientName = (patient?: Patient) =>
  patient ? `${patient.first_name} ${patient.last_name}`.trim() : "-";

const groupAppointmentsByDate = (appointments: Appointment[]) =>
  appointments.reduce<Record<string, Appointment[]>>((groups, appointment) => {
    const date = dateFormatter.format(new Date(appointment.starts_at));

    return {
      ...groups,
      [date]: [...(groups[date] ?? []), appointment],
    };
  }, {});

export const CalendarPage = () => {
  const {
    data: appointments = [],
    isPending: isPendingAppointments,
    error: appointmentsError,
  } = useGetList<Appointment>("appointments", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "starts_at", order: "ASC" },
  });

  const patientIds = useMemo(
    () => getUniqueIds(appointments.map((appointment) => appointment.patient_id)),
    [appointments],
  );
  const serviceIds = useMemo(
    () => getUniqueIds(appointments.map((appointment) => appointment.service_id)),
    [appointments],
  );

  const { data: patients = [], error: patientsError } =
    useGetManyAggregate<Patient>(
      "patients",
      { ids: patientIds },
      { enabled: patientIds.length > 0 },
    );
  const { data: services = [], error: servicesError } =
    useGetManyAggregate<Service>(
      "services",
      { ids: serviceIds },
      { enabled: serviceIds.length > 0 },
    );

  const patientsById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );
  const servicesById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );
  const groupedAppointments = useMemo(
    () => groupAppointmentsByDate(appointments),
    [appointments],
  );

  const hasError = appointmentsError || patientsError || servicesError;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kalendár</h1>
        <p className="text-sm text-muted-foreground">
          Read-only prehľad termínov podľa dní.
        </p>
      </div>

      {isPendingAppointments ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Načítavam termíny...
          </CardContent>
        </Card>
      ) : hasError ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Termíny sa nepodarilo načítať.
          </CardContent>
        </Card>
      ) : appointments.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            V kalendári zatiaľ nie sú žiadne termíny.
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedAppointments).map(([date, dayAppointments]) => (
          <Card key={date} className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">{date}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y px-0">
              {dayAppointments.map((appointment) => {
                const patient = patientsById.get(appointment.patient_id);
                const service = servicesById.get(appointment.service_id);

                return (
                  <div
                    key={appointment.id}
                    className="grid gap-3 px-4 py-4 md:grid-cols-[9rem_1fr_auto]"
                  >
                    <div className="font-medium tabular-nums">
                      {timeFormatter.format(new Date(appointment.starts_at))} -{" "}
                      {timeFormatter.format(new Date(appointment.ends_at))}
                    </div>
                    <div>
                      <div className="font-medium">{getPatientName(patient)}</div>
                      <div className="text-sm text-muted-foreground">
                        {service?.name ?? "-"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <Badge variant="secondary">
                        {statusLabels[appointment.status]}
                      </Badge>
                      <Badge variant="outline">
                        {sourceLabels[appointment.source]}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};
