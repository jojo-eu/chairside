# Chairside Terminology

Chairside is a clinic operations dashboard for an AI receptionist product. UI terminology should support the core MVP loop:

```text
AI call -> appointment -> dashboard -> reminder -> patient response -> status
```

Code identifiers can remain English. MVP UI strings should be Slovak.

## Terminology Principles

- Use dental clinic operations language, not sales CRM language.
- Treat Slovak as the MVP product language.
- Keep `src/components/atomic-crm` unchanged for now.
- Do not rename existing database tables as part of documentation or terminology work.
- Do not preserve concepts just because Atomic CRM has them.
- Avoid terms that imply EHR, medical records, or billing functionality.
- Avoid generic AI OS, workflow builder, campaign platform, and CRM platform language.

## Core MVP Terms

| English concept | Slovak UI term | Internal direction | Notes |
| --- | --- | --- | --- |
| Dashboard | Dashboard | Keep as dashboard | Operational overview. |
| Patient | Pacient | New `patients` entity | Replaces contact concept for MVP. |
| Patients | Pacienti | New `patients` resource | Main people resource. |
| Calendar | Kalendár | New appointment calendar view | Read-only day/week in MVP. |
| Appointment | Termín | New `appointments` entity | Core scheduling entity. |
| Appointments | Termíny | New appointments resource | Replaces sales pipeline as operational center. |
| Reminder | Pripomienka | New `reminders` entity | Appointment-bound only. |
| Reminders | Pripomienky | New reminders resource | Not a campaign system. |
| Call | Hovor | New `call_logs` entity | AI receptionist call log. |
| Calls | Hovory | New calls resource | Shows transcript, summary, outcome, review flag. |
| Service | Služba | New `services` entity | Appointment type with duration and buffer. |
| Clinic | Klinika | New `clinics` entity | Tenant. |
| Clinic member | Člen kliniky | New `clinic_members` entity | User-clinic membership and role. |
| Message | Správa | New `messages` entity | SMS/email/WhatsApp-capable schema; MVP uses SMS. |
| Activity log | Aktivita | New `activity_log` entity | Business events only. |
| Opt-out | Nekontaktovať | New `opt_outs` entity | Communication opt-out. |
| Settings | Nastavenia | Settings area | MVP-safe clinic configuration. |

## Atomic CRM Concepts To Hide Or Replace

| Atomic CRM concept | MVP treatment | Reason |
| --- | --- | --- |
| Contacts | Replace with Pacienti | Patients are first-class MVP entity. |
| Companies | Hide/remove from navigation | Not part of the AI receptionist core loop. |
| Deals | Hide/remove from navigation | Treatment-plan pipeline is not the MVP center. |
| Sales pipeline | Hide/remove | Sales positioning conflicts with clinic operations. |
| Sales opportunities | Hide/remove | Not relevant to appointment booking loop. |
| Tasks | Do not make central | Follow-up tasks may come later, but MVP centers on appointments and reminders. |
| Notes | Reframe as patient/appointment notes where needed | Avoid clinical-note implications. |
| Account manager | Responsible user / staff, if needed | Sales term does not fit. |
| Revenue / budget | Avoid in MVP | Billing and treatment-plan value are out of scope. |

## Navigation Labels

MVP navigation:

| Route concept | Slovak label |
| --- | --- |
| Dashboard | Dashboard |
| Patients | Pacienti |
| Calendar | Kalendár |
| Appointments | Termíny |
| Reminders | Pripomienky |
| Calls | Hovory |
| Settings | Nastavenia |

## Appointment Statuses

| Value | Slovak label | Meaning |
| --- | --- | --- |
| `scheduled` | Naplánovaný | Appointment exists and has not yet been reminded or confirmed. |
| `reminder_sent` | Pripomienka odoslaná | 24h reminder was sent. |
| `confirmed` | Potvrdený | Patient confirmed. |
| `cancelled` | Zrušený | Appointment was cancelled. |
| `needs_reschedule` | Vyžaduje presunutie | Needs human follow-up to reschedule. |
| `completed` | Dokončený | Appointment happened. |
| `no_show` | Nedostavil sa | Patient did not attend. |

## Appointment Sources

| Value | Slovak label |
| --- | --- |
| `manual` | Ručne |
| `ai_voice` | AI hovor |
| `ai_sms` | AI SMS |
| `imported` | Import |

## Call Outcomes

| Value | Slovak label |
| --- | --- |
| `booked` | Rezervácia |
| `rescheduled` | Presunuté |
| `cancelled` | Zrušené |
| `info_only` | Informačný hovor |
| `declined` | Odmietnuté |
| `wrong_number` | Nesprávne číslo |
| `no_answer` | Bez odpovede |
| `technical_issue` | Technický problém |
| `escalated_to_human` | Postúpené človeku |

## Reminder Statuses

| Value | Slovak label |
| --- | --- |
| `pending` | Čaká |
| `sent` | Odoslaná |
| `delivered` | Doručená |
| `failed` | Zlyhalo |
| `responded` | Odpovedané |
| `cancelled` | Zrušená |

## Reminder Responses

Positive responses should be parsed case-insensitively and accent-insensitively:

- `ÁNO`
- `ANO`
- `YES`
- `OK`
- `PRIDEM`
- `PRÍDEM`
- `Y`

Negative responses:

- `NIE`
- `NO`
- `NEMOZEM`
- `NEMÔŽEM`
- `ZRUSIT`
- `ZRUŠIŤ`
- `N`

Opt-out responses:

- `STOP`
- `UNSUBSCRIBE`

Anything else should be stored as an inbound message and flagged for human review.

## Patient Labels

Patient list columns:

| Field concept | Slovak label |
| --- | --- |
| Name | Meno |
| Phone | Telefón |
| Last visit | Posledná návšteva |
| Next appointment | Ďalší termín |
| Do not contact | Nekontaktovať |
| Actions | Akcie |

Patient detail tabs:

| Tab concept | Slovak label |
| --- | --- |
| Info | Info |
| Appointments | Termíny |
| Communication | Komunikácia |
| Calls | Hovory |

## Actions

| Action | Slovak label |
| --- | --- |
| Confirm | Potvrdiť |
| Cancel | Zrušiť |
| Reschedule | Presunúť |
| Mark completed | Označiť ako dokončené |
| Mark no-show | Označiť ako nedostavený |
| Save | Uložiť |
| Delete | Vymazať |
| Edit | Upraviť |
| Add | Pridať |

## Time Labels

| Concept | Slovak label |
| --- | --- |
| Today | Dnes |
| Tomorrow | Zajtra |
| Yesterday | Včera |
| This week | Tento týždeň |
| Next week | Budúci týždeň |

## Settings Terms

MVP settings:

| English concept | Slovak label | Notes |
| --- | --- | --- |
| Clinic info | Klinika info | Read-only in MVP; edited via Supabase Studio. |
| Working hours | Pracovné hodiny | Editable. |
| Services | Služby | CRUD. |
| AI assistant | AI asistent | Name, tone, custom instructions. |
| SMS templates | SMS šablóny | Template editor. |

Do not implement MVP settings for:

- Billing.
- Team management.
- Notification preferences.
- Integrations.

## Terms To Avoid In MVP

- Deal.
- Company.
- Sales pipeline.
- Sales opportunity.
- Campaign.
- Segment.
- Recall campaign.
- Waitlist automation.
- AI OS.
- Agent builder.
- Prompt manager.
- Workflow builder.
- Medical record.
- EHR.
- Billing.
- Patient portal.
- Multi-staff scheduling.

## Localization Notes

MVP is Slovak-first. Czech comes later as a separate translation and wording pass. Do not build a multilingual product surface before the Slovak workflow is stable.
