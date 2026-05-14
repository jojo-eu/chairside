--
-- Row Level Security
-- This file declares RLS policies for all tables.
--

-- Enable RLS on all tables
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.patients enable row level security;
alter table public.services enable row level security;
alter table public.clinic_closures enable row level security;
alter table public.appointments enable row level security;
alter table public.chairside_activity_log enable row level security;
alter table public.reminders enable row level security;
alter table public.messages enable row level security;
alter table public.opt_outs enable row level security;
alter table public.call_logs enable row level security;
alter table public.provider_events enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;

-- Clinics
create policy "Clinic members can view their clinics" on public.clinics for select to authenticated using (id in (select public.current_clinic_ids()));

-- Clinic Members
create policy "Clinic members can view memberships in their clinics" on public.clinic_members for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Patients
create policy "Clinic members can view patients in their clinics" on public.patients for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Services
create policy "Clinic members can view services in their clinics" on public.services for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Clinic Closures
create policy "Clinic members can view closures in their clinics" on public.clinic_closures for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Appointments
create policy "Clinic members can view appointments in their clinics" on public.appointments for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Chairside Activity Log
create policy "Clinic members can view Chairside activity in their clinics" on public.chairside_activity_log for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Reminders
create policy "Clinic members can view reminders in their clinics" on public.reminders for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Messages
create policy "Clinic members can view messages in their clinics" on public.messages for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Opt Outs
create policy "Clinic members can view opt outs in their clinics" on public.opt_outs for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Call Logs
create policy "Clinic members can view call logs in their clinics" on public.call_logs for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Provider Events
create policy "Clinic members can view provider events in their clinics" on public.provider_events for select to authenticated using (clinic_id in (select public.current_clinic_ids()));

-- Companies
create policy "Enable read access for authenticated users" on public.companies for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.companies for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.companies for update to authenticated using (true) with check (true);
create policy "Company Delete Policy" on public.companies for delete to authenticated using (true);

-- Contacts
create policy "Enable read access for authenticated users" on public.contacts for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contacts for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.contacts for update to authenticated using (true) with check (true);
create policy "Contact Delete Policy" on public.contacts for delete to authenticated using (true);

-- Contact Notes
create policy "Enable read access for authenticated users" on public.contact_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contact_notes for insert to authenticated with check (true);
create policy "Contact Notes Update policy" on public.contact_notes for update to authenticated using (true);
create policy "Contact Notes Delete Policy" on public.contact_notes for delete to authenticated using (true);

-- Deals
create policy "Enable read access for authenticated users" on public.deals for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deals for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.deals for update to authenticated using (true) with check (true);
create policy "Deals Delete Policy" on public.deals for delete to authenticated using (true);

-- Deal Notes
create policy "Enable read access for authenticated users" on public.deal_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deal_notes for insert to authenticated with check (true);
create policy "Deal Notes Update Policy" on public.deal_notes for update to authenticated using (true);
create policy "Deal Notes Delete Policy" on public.deal_notes for delete to authenticated using (true);

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags
create policy "Enable read access for authenticated users" on public.tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tags for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.tags for update to authenticated using (true);
create policy "Enable delete for authenticated users only" on public.tags for delete to authenticated using (true);

-- Tasks
create policy "Enable read access for authenticated users" on public.tasks for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tasks for insert to authenticated with check (true);
create policy "Task Update Policy" on public.tasks for update to authenticated using (true);
create policy "Task Delete Policy" on public.tasks for delete to authenticated using (true);

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);
