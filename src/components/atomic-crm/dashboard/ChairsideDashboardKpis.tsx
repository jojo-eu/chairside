import { useMemo } from "react";
import { useGetList, type RaRecord } from "ra-core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { Appointment, Patient, Service } from "../types";

const clinicTimeZone = "Europe/Bratislava";

type ClinicDateParts = {
  year: number;
  month: number;
  day: number;
};

const getClinicDateParts = (date: Date): ClinicDateParts => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinicTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
};

const addDays = (
  { year, month, day }: ClinicDateParts,
  days: number,
): ClinicDateParts => {
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const getTimeZoneOffsetMinutes = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: clinicTimeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const timeZoneName = parts.find((part) => part.type === "timeZoneName")?.value;
  const match = timeZoneName?.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const [, sign, hours, minutes = "0"] = match;
  const offset = Number(hours) * 60 + Number(minutes);

  return sign === "-" ? -offset : offset;
};

const getUtcStartOfClinicDate = ({ year, month, day }: ClinicDateParts) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess);

  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
};

const useResourceCount = <RecordType extends RaRecord>(
  resource: string,
  sortField: string,
  filter: Record<string, unknown> = {},
) =>
  useGetList<RecordType>(resource, {
    pagination: { page: 1, perPage: 1 },
    sort: { field: sortField, order: "ASC" },
    filter,
  });

const KpiCard = ({
  label,
  value,
  isPending,
  hasError,
}: {
  label: string;
  value?: number;
  isPending: boolean;
  hasError: boolean;
}) => (
  <Card className="gap-3 py-5">
    <CardHeader className="px-5">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent className="px-5">
      <div className="text-3xl font-semibold tabular-nums">
        {hasError ? "-" : isPending ? "..." : (value ?? 0)}
      </div>
    </CardContent>
  </Card>
);

export const ChairsideDashboardKpis = () => {
  const dateRange = useMemo(() => {
    const today = getClinicDateParts(new Date());
    const tomorrow = addDays(today, 1);
    const afterTomorrow = addDays(today, 2);

    return {
      todayStart: getUtcStartOfClinicDate(today).toISOString(),
      tomorrowStart: getUtcStartOfClinicDate(tomorrow).toISOString(),
      afterTomorrowStart: getUtcStartOfClinicDate(afterTomorrow).toISOString(),
    };
  }, []);

  const patients = useResourceCount<Patient>("patients", "created_at");
  const todayAppointments = useResourceCount<Appointment>(
    "appointments",
    "starts_at",
    {
      "starts_at@gte": dateRange.todayStart,
      "starts_at@lt": dateRange.tomorrowStart,
    },
  );
  const tomorrowAppointments = useResourceCount<Appointment>(
    "appointments",
    "starts_at",
    {
      "starts_at@gte": dateRange.tomorrowStart,
      "starts_at@lt": dateRange.afterTomorrowStart,
    },
  );
  const unconfirmedAppointments = useResourceCount<Appointment>(
    "appointments",
    "starts_at",
    {
      "status@in": "(scheduled,reminder_sent,needs_reschedule)",
    },
  );
  const activeServices = useResourceCount<Service>("services", "display_order", {
    "active@eq": true,
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label="Počet pacientov"
        value={patients.total}
        isPending={patients.isPending}
        hasError={!!patients.error}
      />
      <KpiCard
        label="Dnešné termíny"
        value={todayAppointments.total}
        isPending={todayAppointments.isPending}
        hasError={!!todayAppointments.error}
      />
      <KpiCard
        label="Zajtrajšie termíny"
        value={tomorrowAppointments.total}
        isPending={tomorrowAppointments.isPending}
        hasError={!!tomorrowAppointments.error}
      />
      <KpiCard
        label="Nepotvrdené termíny"
        value={unconfirmedAppointments.total}
        isPending={unconfirmedAppointments.isPending}
        hasError={!!unconfirmedAppointments.error}
      />
      <KpiCard
        label="Aktívne služby"
        value={activeServices.total}
        isPending={activeServices.isPending}
        hasError={!!activeServices.error}
      />
    </div>
  );
};
