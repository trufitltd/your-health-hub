# Phase 2: Service Multi-Tenancy Report

**Status:** ✅ COMPLETE  
**Date:** 2026-08-28  
**Tests:** 43 passing (22 existing + 21 new)

---

## Executive Summary

Phase 2 completed service-level multi-tenancy. All core services (Pricing, Availability, Wallet, Booking) now accept an optional `organisationId` parameter and scope their database queries accordingly. Hard-coded "MyEDoctor" brand references have been replaced with configurable `organisation_config` lookups.

---

## Migration Applied

**File:** `supabase/migrations/20260828100000_add_org_context_to_services.sql`

### New Tables
| Table | Purpose |
|-------|---------|
| `organisation_config` | Key-value config per org (brand_name, brand_email, support_email, sms_signature, vapid_subject) |

### Columns Added
| Table | Column | Type | Nullable |
|-------|--------|------|----------|
| `doctor_wallet` | `organisation_id` | uuid | YES |
| `doctor_wallet_transactions` | `organisation_id` | uuid | YES |
| `doctor_schedules` | `organisation_id` | uuid | YES |
| `pricing_rules` | `organisation_id` | uuid | YES |
| `pricing_feature_flags` | `organisation_id` | uuid | YES |

### New Functions
- `get_doctor_org_id(p_doctor_id uuid)` — resolves org from doctor

### Data Backfilled
All new `organisation_id` columns set to MyE-Doctor org for existing data.

### RLS Policies
Org-scoped policies added for all new tables (additive, with `organisation_id IS NULL` fallback).

---

## Services Updated

### PricingService
- Constructor: `organisationId?: string | null`
- Filters: `pricing_feature_flags`, `pricing_profiles`, `pricing_rules`, `consultation_types`, `doctor_tiers` by `organisation_id`

### AvailabilityService
- Constructor: `organisationId?: string | null`
- Filters: `pricing_feature_flags`, `doctor_schedules`, `appointments` by `organisation_id`

### WalletService
- Constructor: `organisationId?: string | null`
- Filters: `doctor_wallet`, `platform_fee_rules` by `organisation_id`

### BookingService
- Constructor: `organisationId?: string | null`
- Appointment insert includes `organisation_id`

---

## Edge Functions Updated

| Function | Change |
|----------|--------|
| `booking-initiate` | Resolves `organisation_id` from doctor, passes to all services |
| `booking-payment-confirm` | Resolves `organisation_id` from appointment, passes to all services |
| `paystack-webhook` | Updated service instantiation order |
| `send-sms` | Loads brand name from `organisation_config` instead of hard-coded |
| `send-push` | Loads VAPID subject from `organisation_config` instead of hard-coded |

---

## Brand References Replaced

| Location | Before | After |
|----------|--------|-------|
| `send-sms` message templates | Hard-coded "MyEDoctor" | `brand_name` / `sms_signature` from `organisation_config` |
| `send-push` VAPID subject | Hard-coded `mailto:myedoctoronline@gmail.com` | `vapid_subject` from `organisation_config` |

---

## Backward Compatibility

- All `organisationId` parameters are optional; when `null`, services behave exactly as before
- All `organisation_id` columns are nullable
- RLS policies include `organisation_id IS NULL` fallback for existing unassigned rows
- No breaking changes to existing API contracts

---

## What This Enables

1. **Org-scoped pricing:** Each org can have its own pricing profiles, rules, consultation types, and feature flags
2. **Org-scoped availability:** Doctor schedules and appointments are tied to specific orgs
3. **Org-scoped wallets:** Wallet balances and fee rules are per-org
4. **Org-scoped branding:** SMS messages and push notifications use org-specific brand names
5. **Multi-org doctors:** A doctor can belong to multiple orgs with different pricing/schedules per org

---

## Test Coverage

21 new tests covering:
- Organisation config model validation
- Service constructor signatures
- Organisation resolution from doctor
- Backward compatibility (null org, RLS fallback)
- Cross-org isolation (pricing, schedules, fees, wallets, appointments)
- SMS brand config (default vs org-specific)
- VAPID subject configuration

---

## What Remains (Phase 3+)

| Item | Priority | Notes |
|------|----------|-------|
| `PromotionService` org context | Medium | Not yet updated with org filtering |
| `emailService.ts` brand references | Low | Hard-coded references not yet replaced |
| `reschedule-payment-initiate/confirm` | Medium | Not yet updated with org context |
| `payment-initialize` | Low | Edge function not yet updated |
| `pricing-preview` | Low | Edge function not yet updated |
| `discovery-starting-prices` | Low | Edge function not yet updated |
| `wallet-release` | Low | Edge function not yet updated |
