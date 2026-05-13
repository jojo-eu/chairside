import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  administrator: boolean;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type Company = {
  name: string;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: number[];
  gender: string;
  sales_id?: Identifier;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
} & Pick<RaRecord, "id">;

export type Patient = {
  clinic_id: Identifier;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  date_of_birth?: string | null;
  language: string;
  notes?: string | null;
  tags: string[];
  last_visit_at?: string | null;
  do_not_contact: boolean;
  do_not_contact_reason?: string | null;
  consent_given_at?: string | null;
  consent_source?: string | null;
  data_retention_until?: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  created_by?: Identifier | null;
} & Pick<RaRecord, "id">;

export type Service = {
  clinic_id: Identifier;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  color: string;
  description?: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type Appointment = {
  clinic_id: Identifier;
  patient_id: Identifier;
  service_id: Identifier;
  starts_at: string;
  ends_at: string;
  status:
    | "scheduled"
    | "reminder_sent"
    | "confirmed"
    | "cancelled"
    | "needs_reschedule"
    | "completed"
    | "no_show";
  source: "manual" | "ai_voice" | "ai_sms" | "imported";
  created_at: string;
  updated_at: string;
  created_by?: Identifier | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  notes?: string | null;
  patient_notes?: string | null;
} & Pick<RaRecord, "id">;

export type Reminder = {
  clinic_id: Identifier;
  appointment_id: Identifier;
  patient_id: Identifier;
  scheduled_for: string;
  sent_at?: string | null;
  status:
    | "pending"
    | "sent"
    | "delivered"
    | "failed"
    | "responded"
    | "cancelled";
  channel: "sms" | "voice";
  template_key: string;
  response_status?: "confirmed" | "declined" | "opted_out" | "needs_review" | null;
  response_received_at?: string | null;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type CallLog = {
  clinic_id: Identifier;
  patient_id?: Identifier | null;
  appointment_id?: Identifier | null;
  direction: "inbound" | "outbound";
  phone: string;
  provider: "vapi" | "telnyx" | "manual" | "system";
  provider_call_id?: string | null;
  status: "started" | "completed" | "failed" | "missed";
  outcome:
    | "booked"
    | "needs_reschedule"
    | "cancelled"
    | "answered_question"
    | "no_action"
    | "failed"
    | "unknown";
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  transcript?: string | null;
  summary?: string | null;
  metadata: Record<string, unknown>;
  needs_review: boolean;
  created_at: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  category: string;
  stage: string;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string;
  sales_id: Identifier;
  index: number;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Task = {
  contact_id: Identifier;
  type: string;
  text: string;
  due_date: string;
  done_date?: string | null;
  sales_id?: Identifier;
} & Pick<RaRecord, "id">;

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type DealStage = LabeledValue;

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}
