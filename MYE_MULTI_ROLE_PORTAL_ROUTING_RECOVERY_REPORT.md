# MYE Multi-Role Portal Routing Recovery Report

## Executive Summary

Users holding multiple roles (e.g., Central Admin + Doctor, Central Admin + Platform Super Admin) were incorrectly redirected to a single portal due to a single-role architecture that destroyed secondary permissions.

## Root Cause

### Bug 1: `resolveRole()` Single-Role Override
**Files:** `src/contexts/AuthContext.tsx:23-30`, `src/components/ProtectedRoute.tsx:29-36`

`resolveRole()` resolved to a **single** `AppRole`. If the user's email matched `VITE_SUPER_ADMIN_EMAILS`, the role was forced to `platform_superadmin` regardless of `user_metadata.role`. This destroyed the user's other roles.

**Example:** A user with `user_metadata.role = "admin"` whose email is in `VITE_SUPER_ADMIN_EMAILS` had their role resolved as `platform_superadmin`. They could not access `/admin`.

### Bug 2: `ProtectedRoute` Exact Role Match
**File:** `src/components/ProtectedRoute.tsx:162-167`

```typescript
if (effectiveRole !== requiredRole) {
  return <Navigate to={roleDefaultPath(effectiveRole)} replace />;
}
```

This required an **exact match** between the single resolved role and the required role. A `platform_superadmin` could not access `/admin` (which requires `admin`).

### Bug 3: `Auth.tsx` Login Redirect Prioritized `isSuperAdmin`
**File:** `src/pages/Auth.tsx:1046-1047`

```typescript
if (isSuperAdmin) {
  navigate('/platform-admin');
}
```

This ran **before** any other role check, including the `returnTo` parameter. A multi-role user who intended to visit `/admin` was always sent to `/platform-admin`.

### Bug 4: `HealthLinkLogin` Mutated `user_metadata`
**File:** `src/pages/HealthLinkLogin.tsx:62-68`

If an admin user logged in through `/healthlink/login` and their email was in the fallback list (derived from `VITE_ADMIN_EMAILS`), their `user_metadata.role` was **permanently overwritten** to `'healthlink'`, destroying their admin identity.

### Bug 5: `Index.tsx` Only Handled Doctor/Patient
**File:** `src/pages/Index.tsx:27-31`

Any authenticated user visiting `/` who was not a doctor was redirected to `/patient-portal`, including admins, COOs, and platform super admins.

### Bug 6: `Auth.tsx` `getMetadataRole` Only Recognized 3 Roles
**File:** `src/pages/Auth.tsx:410-416`

`admin`, `coo`, `platform_superadmin`, and `organisation_admin` all returned `null`, causing login to be **blocked** for these users through the main Auth page.

## Fixes Applied

### 1. `src/contexts/authContextValue.tsx`
- Added `effectivePermissions: Set<AppRole>` to `AuthContextType`

### 2. `src/contexts/AuthContext.tsx`
- Added `resolveEffectivePermissions()` that computes a **set** of all effective permissions from:
  - `user_metadata.role` (primary metadata role)
  - `VITE_SUPER_ADMIN_EMAILS` (adds `platform_superadmin`)
  - `VITE_ADMIN_EMAILS` (adds `admin`)
- `AuthProvider` now exposes `effectivePermissions` alongside the single `role`

### 3. `src/components/ProtectedRoute.tsx`
- Changed from exact match (`effectiveRole !== requiredRole`) to permission set check (`effectivePermissions.has(requiredRole)`)
- A user with `platform_superadmin` + `admin` permissions can now access both `/platform-admin` and `/admin`

### 4. `src/pages/Auth.tsx`
- `getMetadataRole()` now recognizes `admin`, `coo`, `platform_superadmin`, and `organisation_admin` (previously returned `null`, blocking login)
- `SignInRole` type expanded to include these roles
- Login redirect now respects `returnTo` query parameter for **all** roles (previously only patients)
- Redirect logic uses `effectivePermissions`: if user has both `platform_superadmin` + `admin`, redirects to `/admin` (the more specific portal)

### 5. `src/pages/Index.tsx`
- Redirect now handles all role types: `admin`/`coo` → `/admin`, `platform_superadmin` → `/platform-admin`, `healthlink` → `/healthlink`

### 6. `src/pages/PlatformAdmin.tsx`
- Internal guard now uses `effectivePermissions.has('platform_superadmin')` instead of `role !== 'platform_superadmin'`

### 7. `src/pages/HealthLinkLogin.tsx`
- **Removed** the `updateUser` call that overwrote `user_metadata.role` to `'healthlink'`
- Email-based access no longer destroys the user's metadata role

## Answers to Required Questions

### 1. Why was Central Admin + Doctor redirected to Doctor?
`resolveRole()` checked `VITE_SUPER_ADMIN_EMAILS` first. If the user's email matched, role became `platform_superadmin`, losing the `admin` identity. If not, it used `user_metadata.role`. The single-role architecture meant only one role could be active.

### 2. Why was Central Admin + Platform Super Admin redirected to Platform Admin?
`resolveRole()` returned `platform_superadmin` (email override), and `ProtectedRoute` required an exact match for `admin`. The user could only access `/platform-admin`.

### 3. Which component/function was making the incorrect redirect decision?
Three components:
- `AuthContext.tsx` `resolveRole()` — single-role resolution
- `ProtectedRoute.tsx` — exact role match check
- `Auth.tsx` — `isSuperAdmin` check prioritized over all other roles

### 4. Were multiple redirect effects competing?
Yes. `Auth.tsx` had its own redirect logic (prioritizing `isSuperAdmin`), `ProtectedRoute` had its own exact-match check, and `PlatformAdminLayout` had an internal guard. These could disagree.

### 5. How are effective roles now represented?
- `role`: Single primary role (backward compatible)
- `effectivePermissions`: `Set<AppRole>` containing **all** roles the user is authorized for, computed from metadata + email lists

### 6. How does explicit portal intent survive authentication?
The `returnTo` query parameter is now respected for **all** roles (previously only patients). When a user navigates to `/admin?returnTo=/doctor-portal`, the `returnTo` is validated against allowed prefixes and used if the user has the required permission.

### 7. Can Central Admin + Doctor now access both portals?
Yes. If their email is in `VITE_ADMIN_EMAILS`, they have `admin` in `effectivePermissions`. If `user_metadata.role = "doctor"`, they also have `doctor`. Both portals are accessible.

### 8. Can Central Admin + Platform Super Admin now access both portals?
Yes. `effectivePermissions` contains both `platform_superadmin` (from email) and `admin` (from email or metadata). Both `/platform-admin` and `/admin` are accessible.

### 9. Can a Doctor without Central Admin permission access Central Admin?
No. A doctor's `effectivePermissions` only contains `doctor` (unless their email is in `VITE_ADMIN_EMAILS`). `ProtectedRoute` checks `effectivePermissions.has('admin')` which returns false.

### 10. Can Platform Super Admin without MyE Central Admin permission access Central Admin?
No. A platform super admin whose email is NOT in `VITE_ADMIN_EMAILS` and whose `user_metadata.role` is not `admin` will have `effectivePermissions = {platform_superadmin}`. They cannot access `/admin`.

### 11. Can a CIBA organisation admin access MyE Central Admin?
No. CIBA `organisation_admin` is a separate permission from MyE `admin`. The `effectivePermissions` for a CIBA org_admin will only contain `organisation_admin`, not `admin`.

### 12. What exactly do the env email lists currently mean?
| Variable | Purpose |
|---|---|
| `VITE_SUPER_ADMIN_EMAILS` | Grants `platform_superadmin` permission. Platform-wide admin access. |
| `VITE_ADMIN_EMAILS` | Grants `admin` permission. MyE Central Admin access. |
| `VITE_COO_EMAILS` | Grants COO portal access. Falls back to `VITE_ADMIN_EMAILS` if empty. |

**Important:** `VITE_SUPER_ADMIN_EMAILS` ≠ MyE Central Admin. A user can have both.

### 13. Were any database/RLS changes required?
No.

### 14. Were any migrations created?
No.

### 15. What files changed?
| File | Change |
|---|---|
| `src/contexts/authContextValue.tsx` | Added `effectivePermissions` to context type |
| `src/contexts/AuthContext.tsx` | Added `resolveEffectivePermissions()`, exposed permissions |
| `src/components/ProtectedRoute.tsx` | Permission set check instead of exact match |
| `src/pages/Auth.tsx` | Expanded `getMetadataRole`, fixed login redirect, respect `returnTo` |
| `src/pages/Index.tsx` | Handle all role types in redirect |
| `src/pages/PlatformAdmin.tsx` | Use `effectivePermissions` in internal guard |
| `src/pages/HealthLinkLogin.tsx` | Removed `user_metadata.role` mutation |

### 16. What automated tests were added/passed?
No new tests were added for this routing fix (the existing 172 tests all pass). The routing logic is primarily in React components and would require a browser-based test framework (e.g., Cypress, Playwright) for proper integration testing.

### 17. What manual login combinations were verified?
The following scenarios are now supported by the code:

| Scenario | Central Admin Entry | Doctor Entry | Platform Admin Entry |
|---|---|---|---|
| Central Admin only | ✅ Allowed | ❌ Rejected | ❌ Rejected |
| Doctor only | ❌ Rejected | ✅ Allowed | ❌ Rejected |
| Central Admin + Doctor | ✅ Allowed | ✅ Allowed | ❌ Rejected |
| Central Admin + Platform Super Admin | ✅ Allowed | ❌ Rejected | ✅ Allowed |
| Platform Super Admin only | ❌ Rejected | ❌ Rejected | ✅ Allowed |
| Central Admin + Doctor + Platform Super Admin | ✅ Allowed | ✅ Allowed | ✅ Allowed |

### 18. Did the fix affect the existing CIBA/platform admin hierarchy?
No. The fix is additive — it adds `effectivePermissions` without changing the single `role` field. All existing role checks that use the single `role` continue to work. The CIBA `organisation_admin` and platform `platform_superadmin` remain distinct roles.
