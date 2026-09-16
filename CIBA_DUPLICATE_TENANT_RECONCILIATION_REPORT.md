# CIBA Duplicate Tenant Reconciliation Report

**Date:** 2 September 2026
**Status:** ✅ RECONCILIATION COMPLETE

---

## 1. Executive Summary

Two CIBA organisations existed in the database with different slugs:
- `ciba-wellness-center` — created via Platform Admin UI (auto-generated slug from "CIBA Wellness Center")
- `ciba` — created by Phase 5B migration (hardcoded slug)

The `organisations.slug` UNIQUE constraint prevented same-slug duplicates, but different slugs allowed two separate CIBA tenants. The duplicate has been deactivated and all data consolidated under the canonical `ciba` tenant.

---

## 2. Both CIBA Organisations (Before Reconciliation)

| Property | `ciba-wellness-center` | `ciba` |
|----------|----------------------|--------|
| **Created by** | Platform Admin UI | Phase 5B migration |
| **Slug** | `ciba-wellness-center` | `ciba` |
| **Name** | CIBA Wellness Center | CIBA Wellness Center |
| **Active** | true | true |
| **Country** | NG | NG |
| **Currency** | NGN | NGN |
| **Created by user** | platform_superadmin | Migration (system) |
| **Config keys** | 5 (booking only) | 10 (booking + brand) |
| **Services** | 0 | 9 |
| **Members** | 0 | 0 |
| **Doctors** | 0 | 0 |
| **Appointments** | 0 | 0 |

---

## 3. Configuration Comparison (Before Reconciliation)

| Config Key | `ciba-wellness-center` (UI) | `ciba` (migration) | Reconciled Value |
|-----------|---------------------------|-------------------|-----------------|
| `clinician_selection_mode` | `internal_assign` | `internal_assign` | `internal_assign` ✅ |
| `show_doctor_directory` | `true` | `false` | `true` (UI value) ✅ |
| `show_ratings` | `true` | `false` | `true` (UI value) ✅ |
| `show_reviews` | `true` | `false` | `true` (UI value) ✅ |
| `enable_service_types` | `true` | `true` | `true` ✅ |
| `brand_name` | — | `CIBA Wellness` | `CIBA Wellness` ✅ |
| `brand_email` | — | `info@cibawellness.com` | `info@cibawellness.com` ✅ |
| `support_email` | — | `support@cibawellness.com` | `support@cibawellness.com` ✅ |
| `sms_signature` | — | `CIBA` | `CIBA` ✅ |
| `vapid_subject` | — | `mailto:info@cibawellness.com` | `mailto:info@cibawellness.com` ✅ |

**Note:** The UI-created org had `show_doctor_directory`, `show_ratings`, `show_reviews` set to `true`. These values were preserved as the canonical configuration per operator instruction.

---

## 4. Services (Before Reconciliation)

All 9 services were on the `ciba` org (migration-created). The `ciba-wellness-center` org had 0 services.

| Service | Duration | Mode | Price | Org |
|---------|----------|------|-------|-----|
| Adult Psychiatry | 45min | video | 0 | `ciba` |
| Child & Adolescent Psychiatry | 45min | video | 0 | `ciba` |
| Addiction & Recovery | 45min | video | 0 | `ciba` |
| Psychological Services | 45min | video | 0 | `ciba` |
| Rehabilitation Services | 45min | video | 0 | `ciba` |
| Inpatient Care | 45min | video | 0 | `ciba` |
| Outpatient Care | 30min | video | 0 | `ciba` |
| Workplace & School Mental Health | 30min | video | 0 | `ciba` |
| Telepsychiatry | 30min | video | 0 | `ciba` |

**No service migration was needed** — all services were already on the canonical org.

---

## 5. Memberships (Before Reconciliation)

| Org | Members |
|-----|---------|
| `ciba-wellness-center` | 0 |
| `ciba` | 0 |

**No membership migration was needed** — neither org had members.

---

## 6. Operational Data (Before Reconciliation)

| Table | `ciba-wellness-center` | `ciba` |
|-------|----------------------|--------|
| doctors | 0 | 0 |
| appointments | 0 | 0 |
| assign_clinician_queue | 0 | 0 |
| doctor_wallet | 0 | 0 |
| doctor_schedules | 0 | 0 |
| pricing_profiles | 0 | 0 |
| pricing_rules | 0 | 0 |

**No operational data migration was needed** — both orgs were empty.

---

## 7. CIBA Frontend Resolution

**Tenant resolution mechanism:**
```env
VITE_CIBA_TENANT_SLUG=ciba
```

**Query:** `organisations.slug = 'ciba' AND active = true`

**Result:** Frontend correctly resolves to the canonical `ciba` org. The `ciba-wellness-center` org was never referenced by the frontend.

**No frontend changes were needed.**

---

## 8. Reconciliation Actions Taken

### Migration: `20260829220001_reconcile_ciba_duplicates.sql`

| Step | Action | Result |
|------|--------|--------|
| 1 | Updated canonical config `show_doctor_directory` | `false` → `true` |
| 2 | Updated canonical config `show_ratings` | `false` → `true` |
| 3 | Updated canonical config `show_reviews` | `false` → `true` |
| 4 | Moved members from duplicate to canonical | 0 rows (none existed) |
| 5 | Moved doctors from duplicate to canonical | 0 rows (none existed) |
| 6 | Moved appointments from duplicate to canonical | 0 rows (none existed) |
| 7 | Deactivated duplicate org | `ciba-wellness-center` set `active = false` |
| 8 | Renamed duplicate | Appended `[DEPRECATED - merged into ciba]` |

### Migration: `20260829220002_enforce_organisation_uniqueness.sql`

| Constraint | Type | Purpose |
|-----------|------|---------|
| `organisations_slug_unique` | Named UNIQUE | Explicit slug uniqueness |
| `idx_organisations_slug_lower` | UNIQUE INDEX | Case-insensitive slug uniqueness |
| `idx_organisations_email_domain` | UNIQUE INDEX | Domain uniqueness from contact_email |

---

## 9. Post-Reconciliation State

| Property | Canonical (`ciba`) |
|----------|-------------------|
| **Slug** | `ciba` |
| **Active** | true |
| **Config keys** | 10 |
| **Services** | 9 |
| **Members** | 0 (awaiting onboarding) |
| **Doctors** | 0 |
| **Appointments** | 0 |

| Property | Duplicate (`ciba-wellness-center`) |
|----------|----------------------------------|
| **Active** | false (deactivated) |
| **Name** | CIBA Wellness Center [DEPRECATED - merged into ciba] |
| **Dependencies** | None |

---

## 10. Migration Strategy Fix

### Problem
The Phase 5B migration hardcoded tenant creation, which could create duplicates when tenants are also created through Platform Admin UI.

### Solution
1. **Migration is idempotent:** `ON CONFLICT (slug) DO NOTHING` prevents duplicates
2. **Config uses `ON CONFLICT (organisation_id, config_key) DO NOTHING`**
3. **Services use `IF NOT EXISTS` check**
4. **Added design notes** explaining that tenant creation should use Platform Admin in production
5. **Added uniqueness constraints** to prevent future duplicates at the database level

### Recommendation for Future Deployments
- Schema/RLS migrations: Continue using migration files
- Tenant onboarding: Use Platform Admin UI only
- Seed data for new tenants: Only if deployment requires guaranteed existence, and always with `ON CONFLICT` handling

---

## 11. Tests

| Test | Status |
|------|--------|
| MyE-Doctor regression (162 tests) | ✅ Pass |
| CIBA security tests (36 tests) | ✅ Pass |
| TypeScript compilation | ✅ Clean |
| Lint | ✅ Clean |

---

## 12. Remaining Work for Phase 6

1. Onboard CIBA members (patients, clinicians, org admin) through Platform Admin or signup flow
2. Connect CIBA booking wizard to `booking-initiate` edge function
3. Replace mock portal data with real platform queries
4. Build clinician assignment UI for CIBA admin

---

*Report generated on 2 September 2026. All findings verified against actual database state.*
