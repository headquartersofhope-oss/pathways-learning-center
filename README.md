# Pathways Learning Center (PLC)
**by REJG Legacy Labs LLC**

> A fully automated, multi-tenant SaaS Learning Management System built for reentry and transitional housing organizations. Licensed to HOH Foundation and partner nonprofits across Texas.

---

## Platform Overview

| | |
|---|---|
| **Owner / IP** | REJG Legacy Labs LLC |
| **Primary Licensee** | Headquarters of Hope Foundation, Inc. (EIN: 39-3366072) |
| **Content Delivery** | HeyGen AI Video Platform |
| **Case Management Integration** | Pathways Hub OS (HOH Foundation) |
| **App ID (Base44)** | 6a06e6dd97f309a6487fa322 |
| **Support** | rodney@rejonesglobal.com |

---

## Architecture

```
RESIDENT
  └── logs into Pathways Hub OS (resident portal view)
      └── browses class catalog (required + elective)
          └── clicks Watch → opens ClassPlayerModal
              └── video fetched from REJG Legacy Labs backend
                  └── HeyGen API (HEYGEN_API_KEY secret, never exposed to client)
                      └── streams video to resident's screen

CASE MANAGER (Pathways Hub OS)
  └── runs AI pathway builder on intake assessment
      └── assigns required classes to resident
          └── monitors progress from resident profile

EXTERNAL ORG RESIDENT
  └── logs into Pathways Learning Center app directly
      └── same curriculum, org-isolated data

REJG LEGACY LABS (you)
  └── sees all orgs, all usage, all logs
      └── generates invoices from ContentViewLog
      └── generates funder reports from ViewLog + completion data
```

---

## Class Catalog

**140 Core Classes across 10 Tracks:**

| Track | Name | Classes |
|---|---|---|
| 1 | Reentry Success & Life at HOH | 14 |
| 2 | Financial Literacy | 14 |
| 3 | Employment & Career Development | 14 |
| 4 | Housing & Tenant Rights | 14 |
| 5 | Legal & Civic Literacy | 14 |
| 6 | Health & Wellness | 16 |
| 7 | Sobriety & Recovery | 14 |
| 8 | Family & Relationships | 14 |
| 9 | Digital Literacy & Tech | 14 |
| 10 | Leadership & Entrepreneurship | 12 |

**Enrichment Classes (self-selected by residents):**
- Fitness & Movement (yoga, body weight, walking, stretching, 5K)
- Cooking & Nutrition (budget cooking, meal prep, SNAP-friendly, soul food)
- Creative Arts (journaling, music therapy, art therapy, writing)
- Financial Enrichment (savings, investing, side hustle taxes)
- Personal Development (public speaking, reading, mindfulness)

---

## Entities

### Core
- `VideoLabel` — maps HeyGen video IDs to class numbers and titles
- `CourseResource` — downloadable PDFs linked to specific classes
- `ClassCatalog` — full browsable catalog including enrichment classes

### Per-User / Per-Org
- `UserProgress` — tracks completion, quiz status, watch % per user per class
- `QuizResult` — stores quiz answers, scores, attempt count
- `Certificate` — issued on track completion
- `ResidentCurriculum` — which classes each resident has (required + elective)
- `LearningPathway` — AI-generated pathway assigned by case manager

### Logging / Billing
- `ContentViewLog` — **automated** — logs every video view event
- `InvoiceRecord` — **automated** — generated monthly per org from ViewLog
- `FunderReport` — **automated** — generated on demand for grant reporting

### Platform
- `Organization` — registered client orgs (name, tier, users, billing)
- `LicenseAgreement` — MSA records between REJG Legacy Labs and each org

---

## Automated Logging

Every video view is automatically logged to `ContentViewLog`:
```json
{
  "org_id": "hoh-foundation",
  "org_name": "HOH Foundation",
  "user_id": "resident-123",
  "class_number": "1.3",
  "class_title": "Building Your Personal 90-Day Plan",
  "video_id": "abc123...",
  "watch_duration_seconds": 487,
  "watch_percentage": 94,
  "session_date": "2026-05-15",
  "session_start": "2026-05-15T14:32:00Z",
  "session_end": "2026-05-15T14:40:27Z",
  "completed": true,
  "quiz_passed": true,
  "quiz_score": 3,
  "device_type": "mobile"
}
```

This log drives:
1. **Monthly invoicing** to each org (per-user or per-view pricing tiers)
2. **Grant reporting** (proof of service: X residents completed Y hours of education)
3. **Outcome tracking** (completion rates, drop-off points, popular classes)

---

## License Tiers

| Tier | Max Users | Features | Billing |
|---|---|---|---|
| **Standard** | 50 | Core 140 classes, basic reporting | Per active user/month |
| **Pro** | 200 | Core + enrichment, advanced reports, certificates | Per active user/month |
| **Enterprise** | Unlimited | Full platform, white-label, API access, custom classes | Annual contract |

HOH Foundation: Enterprise (founding partner, special rate under MSA)

---

## Repository Structure

```
pathways-learning-center/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── api-reference.md
│   ├── onboarding-guide.md
│   └── billing-model.md
├── curriculum/
│   ├── class-catalog.json        ← all 140+ classes with metadata
│   ├── track-descriptions.md
│   └── enrichment-catalog.json  ← elective classes
├── production/
│   ├── heygen-production-system.js   ← video generation scripts
│   └── multi-part-system.md
├── logging/
│   ├── content-view-log-schema.json
│   ├── invoice-generator.js
│   └── funder-report-template.md
├── assets/
│   ├── certificates/             ← certificate templates
│   └── thumbnails/               ← class thumbnail configs
└── legal/
    ├── MSA-template.md           ← master service agreement template
    └── license-agreement.md
```

---

## Key Contacts

| Role | Name | Email |
|---|---|---|
| Platform Owner | Rodney E. Jones | rodney@rejonesglobal.com |
| REJG Legacy Labs | info@rejonesglobal.com | — |
| HOH Foundation | info@headquartersofhope.org | — |
| Support Line | — | 737-999-0256 |

---

*© 2026 REJG Legacy Labs LLC. All rights reserved. Pathways Learning Center is proprietary software licensed, not sold, to partner organizations under signed Master Service Agreements.*
