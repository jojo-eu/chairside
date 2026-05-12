# Chairside Codex Project Brief

## Project Overview

Chairside is a product fork of `marmelab/atomic-crm`.

The goal is to turn Atomic CRM into a dental-clinic-focused CRM and workflow application for Slovak/Czech dental practices. It should eventually support patient management, clinic workflows, treatment follow-ups, reception/admin tasks, and future AI receptionist or voice-agent integrations.

This repository should be treated as a standalone product fork, not as a contribution branch intended to be merged back into `marmelab/atomic-crm`.

## Repository

- GitHub repository: `jojo-eu/chairside`
- Original upstream repository: `marmelab/atomic-crm`
- Local path: `~/Documents/projects/chairside`

Runtime stack inherited from Atomic CRM:

- React
- Vite
- TypeScript
- Shadcn Admin Kit / shadcn/ui
- Supabase local backend
- Docker
- Node 22 LTS

## Local Development Setup

The project has already been installed and successfully run locally.

Verified:

- Docker works
- Docker Compose works
- `docker run hello-world` works
- Node version is `v22.22.2`
- `make install` completed successfully
- `make start` starts the local Supabase stack and Vite app
- App runs locally at `http://localhost:5173/`
- Local Supabase dashboard runs at `http://localhost:54323/`

Useful commands:

```bash
make install
make start
git status
git diff

Do not run npm audit fix, upgrade Supabase CLI, or upgrade major dependencies unless explicitly asked.

Git / Branch History So Far

The repository was forked from:

https://github.com/marmelab/atomic-crm

The fork was created as:

https://github.com/jojo-eu/chairside

Git remotes:

origin   = https://github.com/jojo-eu/chairside.git
upstream = https://github.com/marmelab/atomic-crm.git

The fork was synchronized with upstream/main.

Branding branch:

feature/chairside-branding

Completed branding commits:

7a9b451 Rebrand app shell to Chairside
fb6dfc1 Replace remaining runtime Atomic CRM labels

These commits changed visible runtime branding from Atomic CRM to Chairside.

Work Already Completed

Completed work:

Created fork from marmelab/atomic-crm.
Renamed fork/product repo to chairside.
Cloned it locally into ~/Documents/projects/chairside.
Added original repository as upstream.
Synced local main with upstream/main.
Verified Docker, Docker Compose, Node 22, and Make.
Ran make install successfully.
Ran make start successfully.
Created first local admin user in the app.
Completed the initial onboarding flow by adding a first contact and note.
Rebranded visible runtime app shell from Atomic CRM to Chairside.
Verified in browser that the app now shows Chairside.
Important Constraints

Do not rename this internal directory yet:

src/components/atomic-crm

That path is heavily used by imports. Renaming it should be treated as a separate refactor.

Do not rename database tables yet:

contacts
companies
deals
notes
tasks
sales

Do not blindly replace every occurrence of atomic-crm or Atomic CRM across the entire repo.

Leave these areas alone unless explicitly asked:

CHANGELOG.md
upstream documentation references
.github/CONTRIBUTING.md
historical changelog entries
test specs unless tests are being updated
registry publishing scripts
package name
Supabase project ID
Product Direction

Chairside should become a dental-clinic-focused CRM and workflow tool.

Initial conceptual terminology under consideration:

Contact -> Patient
Contacts -> Patients
Company -> Clinic or Practice
Companies -> Clinics or Practices
Deal -> Treatment Plan or Case
Deals -> Treatment Plans or Cases
Task -> Follow-up
Tasks -> Follow-ups
Notes -> Notes or Clinical Notes

Do not apply this terminology blindly. Use the product materials and workflows provided by the owner before changing labels.

Preferred Implementation Style

Use small, reviewable commits.

Before every commit:

git status
git diff

After app changes:

make start

Verify the UI manually in the browser.

Recommended Next Step

Before changing terminology, review the owner's Chairside product materials and convert them into:

product scope
information architecture
dental domain terminology
UI navigation changes
data model changes
implementation plan broken into small branches

Recommended immediate Codex task:

Create or update:

docs/chairside/product-brief.md
docs/chairside/terminology.md
docs/chairside/implementation-plan.md

based on the provided Chairside materials.

Do not change application code yet except where explicitly requested.

Done Criteria For Codex Tasks

A task is done only when:

changes are limited to the requested scope
git diff is clean and understandable
no secrets or .env files are committed
the app still runs with make start
runtime UI is manually checked in the browser when UI code changes
branch is pushed to origin
a concise summary of changed files and reasoning is provided