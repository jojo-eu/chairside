import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  MessageSquareReply,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Appointment, Patient, Reminder, Service } from "../types";

type Clinic = {
  id: string;
  name: string;
  slug: string;
};

type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

type AvailabilityResponse = {
  clinic_id: string;
  service_id: string;
  date: string;
  timezone: string;
  slots: AvailabilitySlot[];
};

type MessageRecord = {
  id: string;
  reminder_id: string | null;
  direction: "inbound" | "outbound";
  status: string;
  body: string;
  created_at: string;
};

type StepResult = {
  ok: boolean;
  status: string;
  data?: unknown;
};

const formatOptionName = (patient: Patient) =>
  `${patient.first_name} ${patient.last_name}`.trim();

const toDatetimeLocalValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return local.toISOString().slice(0, 16);
};

const getDefaultStart = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(9, 0, 0, 0);

  return toDatetimeLocalValue(date);
};

const toIsoTimestamp = (datetimeLocal: string) =>
  new Date(datetimeLocal).toISOString();

async function readFunctionError(error: any) {
  try {
    const details = await error?.context?.json();

    return details?.message || details?.error || error?.message;
  } catch {
    return error?.message;
  }
}

const JsonBlock = ({
  title,
  value,
  testId,
}: {
  title: string;
  value: unknown;
  testId?: string;
}) => {
  if (!value) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <pre
        data-testid={testId}
        className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
};

export const BookingTestPage = () => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState(getDefaultStart);
  const [responseBody, setResponseBody] = useState("ÁNO");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<StepResult | null>(null);
  const [booking, setBooking] = useState<StepResult | null>(null);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [markSent, setMarkSent] = useState<StepResult | null>(null);
  const [response, setResponse] = useState<StepResult | null>(null);

  const clinicPatients = patients.filter(
    (patient) => String(patient.clinic_id) === clinicId,
  );
  const clinicServices = services.filter(
    (service) => String(service.clinic_id) === clinicId && service.active,
  );

  const runStep = async <T,>(
    key: string,
    action: () => Promise<T>,
  ): Promise<T | null> => {
    setLoading(key);
    setError(null);

    try {
      return await action();
    } catch (stepError) {
      const message =
        stepError instanceof Error
          ? stepError.message
          : "Nastala neznáma chyba.";
      setError(message);
      return null;
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    void runStep("load", async () => {
      const [clinicsResult, patientsResult, servicesResult] = await Promise.all([
        supabase.from("clinics").select("id, name, slug").order("name"),
        supabase
          .from("patients")
          .select("*")
          .order("last_name", { ascending: true })
          .limit(100),
        supabase
          .from("services")
          .select("*")
          .order("display_order", { ascending: true }),
      ]);

      if (clinicsResult.error) {
        throw new Error(clinicsResult.error.message);
      }
      if (patientsResult.error) {
        throw new Error(patientsResult.error.message);
      }
      if (servicesResult.error) {
        throw new Error(servicesResult.error.message);
      }

      const loadedClinics = clinicsResult.data ?? [];
      setClinics(loadedClinics);
      setPatients((patientsResult.data ?? []) as Patient[]);
      setServices((servicesResult.data ?? []) as Service[]);

      if (loadedClinics[0]) {
        setClinicId(String(loadedClinics[0].id));
      }
    });
  }, [supabase]);

  useEffect(() => {
    if (!clinicId) {
      return;
    }

    if (!clinicPatients.some((patient) => String(patient.id) === patientId)) {
      setPatientId(String(clinicPatients[0]?.id ?? ""));
    }
    if (!clinicServices.some((service) => String(service.id) === serviceId)) {
      setServiceId(String(clinicServices[0]?.id ?? ""));
    }
  }, [clinicId, clinicPatients, clinicServices, patientId, serviceId]);

  const invokeFunction = async <T,>(name: string, body: Record<string, any>) => {
    const { data, error: functionError } =
      await supabase.functions.invoke<T>(name, {
        method: "POST",
        body,
      });

    if (functionError) {
      throw new Error(await readFunctionError(functionError));
    }

    return data as T;
  };

  const checkAvailability = () =>
    runStep("availability", async () => {
      if (!clinicId || !serviceId || !startsAt) {
        throw new Error("Vyberte kliniku, službu a čas termínu.");
      }

      const data = await invokeFunction<AvailabilityResponse>(
        "check-availability",
        {
          clinic_id: clinicId,
          service_id: serviceId,
          date: startsAt.slice(0, 10),
        },
      );
      const result = { ok: true, status: "HTTP 200", data };
      setAvailability(result);

      return result;
    });

  const bookAppointment = () =>
    runStep("booking", async () => {
      if (!clinicId || !patientId || !serviceId || !startsAt) {
        throw new Error("Vyberte kliniku, pacienta, službu a čas termínu.");
      }

      const data = await invokeFunction<{ appointment: Appointment }>(
        "book-appointment",
        {
          clinic_id: clinicId,
          patient_id: patientId,
          service_id: serviceId,
          starts_at: toIsoTimestamp(startsAt),
          source: "manual",
        },
      );

      const { data: reminders, error: reminderError } = await supabase
        .from("reminders")
        .select("*")
        .eq("appointment_id", data.appointment.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (reminderError) {
        throw new Error(reminderError.message);
      }

      const createdReminder = (reminders?.[0] as Reminder | undefined) ?? null;
      setReminder(createdReminder);

      const result = {
        ok: true,
        status: "HTTP 201",
        data: { ...data, reminder: createdReminder },
      };
      setBooking(result);
      setMarkSent(null);
      setResponse(null);

      return result;
    });

  const markReminderSent = () =>
    runStep("markSent", async () => {
      if (!clinicId || !reminder?.id) {
        throw new Error("Najprv vytvorte termín s pripomienkou.");
      }

      const data = await invokeFunction<{
        reminder: Reminder;
        message: MessageRecord;
      }>("mark-reminder-sent", {
        clinic_id: clinicId,
        reminder_id: reminder.id,
        provider: "system",
      });
      setReminder(data.reminder);

      const result = { ok: true, status: "HTTP 200", data };
      setMarkSent(result);

      return result;
    });

  const receiveReminderResponse = () =>
    runStep("response", async () => {
      if (!clinicId || !reminder?.id) {
        throw new Error("Najprv vytvorte termín s pripomienkou.");
      }

      const data = await invokeFunction<{
        reminder: Reminder;
        message: MessageRecord;
        parsed_response: string;
      }>("receive-reminder-response", {
        clinic_id: clinicId,
        reminder_id: reminder.id,
        body: responseBody,
        provider: "system",
      });
      setReminder(data.reminder);

      const result = { ok: true, status: "HTTP 200", data };
      setResponse(result);

      return result;
    });

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Interný testovací nástroj
        </p>
        <h1 className="text-2xl font-semibold">Booking/reminder flow</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Lokálna pomôcka pre overenie Edge Function reťazca. Neposiela SMS a
          nie je určená pre pacientov.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-lg border bg-background p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Klinika</Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger className="w-full" data-testid="clinic-select">
              <SelectValue placeholder="Vyberte kliniku" />
            </SelectTrigger>
            <SelectContent>
              {clinics.map((clinic) => (
                <SelectItem key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Pacient</Label>
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger className="w-full" data-testid="patient-select">
              <SelectValue placeholder="Vyberte pacienta" />
            </SelectTrigger>
            <SelectContent>
              {clinicPatients.map((patient) => (
                <SelectItem key={String(patient.id)} value={String(patient.id)}>
                  {formatOptionName(patient)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Služba</Label>
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger className="w-full" data-testid="service-select">
              <SelectValue placeholder="Vyberte službu" />
            </SelectTrigger>
            <SelectContent>
              {clinicServices.map((service) => (
                <SelectItem key={String(service.id)} value={String(service.id)}>
                  {service.name} ({service.duration_minutes} min)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="starts-at">Začiatok termínu</Label>
          <Input
            id="starts-at"
            data-testid="starts-at-input"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-4">
        <Button
          type="button"
          variant="outline"
          onClick={checkAvailability}
          disabled={loading !== null}
          data-testid="check-availability-button"
        >
          <Search />
          Skontrolovať dostupnosť
        </Button>
        <Button
          type="button"
          onClick={bookAppointment}
          disabled={loading !== null}
          data-testid="book-appointment-button"
        >
          <CalendarCheck />
          Vytvoriť termín
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={markReminderSent}
          disabled={loading !== null || !reminder?.id}
          data-testid="mark-sent-button"
        >
          <Send />
          Označiť odoslané
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={receiveReminderResponse}
          disabled={loading !== null || !reminder?.id}
          data-testid="receive-response-button"
        >
          <MessageSquareReply />
          Zaznamenať odpoveď
        </Button>
      </section>

      <section className="grid gap-4 rounded-lg border bg-background p-4 md:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <Label htmlFor="response-body">Odpoveď pacienta</Label>
          <Textarea
            id="response-body"
            data-testid="response-body-input"
            value={responseBody}
            onChange={(event) => setResponseBody(event.target.value)}
          />
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Termín</span>
            <p data-testid="appointment-id" className="break-all font-mono">
              {booking?.data &&
              typeof booking.data === "object" &&
              "appointment" in booking.data
                ? String((booking.data as { appointment: Appointment }).appointment.id)
                : "-"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Pripomienka</span>
            <p data-testid="reminder-id" className="break-all font-mono">
              {reminder?.id ?? "-"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Stav pripomienky</span>
            <p data-testid="reminder-status" className="font-medium">
              {reminder?.status ?? "-"}
              {reminder?.response_status ? ` / ${reminder.response_status}` : ""}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Prebieha krok: {loading}
        </p>
      ) : null}

      {availability?.data &&
      (availability.data as AvailabilityResponse).slots?.length ? (
        <section className="space-y-2 rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">Dostupné sloty</h2>
          <div className="flex flex-wrap gap-2">
            {(availability.data as AvailabilityResponse).slots
              .slice(0, 12)
              .map((slot) => (
                <Button
                  key={slot.starts_at}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStartsAt(toDatetimeLocalValue(new Date(slot.starts_at)))}
                >
                  {new Intl.DateTimeFormat("sk-SK", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Bratislava",
                  }).format(new Date(slot.starts_at))}
                </Button>
              ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <JsonBlock
          title={`Dostupnosť ${availability?.status ?? ""}`.trim()}
          value={availability?.data}
          testId="availability-result"
        />
        <JsonBlock
          title={`Booking ${booking?.status ?? ""}`.trim()}
          value={booking?.data}
          testId="booking-result"
        />
        <JsonBlock
          title={`Odoslanie ${markSent?.status ?? ""}`.trim()}
          value={markSent?.data}
          testId="mark-sent-result"
        />
        <JsonBlock
          title={`Odpoveď ${response?.status ?? ""}`.trim()}
          value={response?.data}
          testId="response-result"
        />
      </div>
    </div>
  );
};
