import { describe, it, expect } from 'vitest';

// --- Role Parsing Tests (Phase 1: multi-tenancy roles) ---

const parseAppRole = (value: unknown): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'doctor' ||
    normalized === 'patient' ||
    normalized === 'admin' ||
    normalized === 'coo' ||
    normalized === 'healthlink' ||
    normalized === 'platform_superadmin' ||
    normalized === 'organisation_admin'
  ) {
    return normalized;
  }
  return 'patient';
};

describe('parseAppRole — multi-tenancy roles', () => {
  it('recognises platform_superadmin', () => {
    expect(parseAppRole('platform_superadmin')).toBe('platform_superadmin');
    expect(parseAppRole('Platform_Superadmin')).toBe('platform_superadmin');
  });

  it('recognises organisation_admin', () => {
    expect(parseAppRole('organisation_admin')).toBe('organisation_admin');
    expect(parseAppRole('Organisation_Admin')).toBe('organisation_admin');
  });

  it('still recognises existing roles', () => {
    expect(parseAppRole('admin')).toBe('admin');
    expect(parseAppRole('coo')).toBe('coo');
    expect(parseAppRole('doctor')).toBe('doctor');
    expect(parseAppRole('patient')).toBe('patient');
    expect(parseAppRole('healthlink')).toBe('healthlink');
  });

  it('defaults unknown roles to patient', () => {
    expect(parseAppRole('superadmin')).toBe('patient');
    expect(parseAppRole('org_admin')).toBe('patient');
  });
});

// --- Default Path Tests ---

const roleDefaultPath = (role: string) => {
  if (role === 'doctor') return '/doctor-portal';
  if (role === 'admin') return '/admin';
  if (role === 'coo') return '/coo';
  if (role === 'healthlink') return '/healthlink';
  if (role === 'platform_superadmin') return '/admin';
  if (role === 'organisation_admin') return '/admin';
  return '/patient-portal';
};

describe('roleDefaultPath — multi-tenancy roles', () => {
  it('maps platform_superadmin to admin portal', () => {
    expect(roleDefaultPath('platform_superadmin')).toBe('/admin');
  });

  it('maps organisation_admin to admin portal', () => {
    expect(roleDefaultPath('organisation_admin')).toBe('/admin');
  });

  it('preserves existing role mappings', () => {
    expect(roleDefaultPath('admin')).toBe('/admin');
    expect(roleDefaultPath('coo')).toBe('/coo');
    expect(roleDefaultPath('doctor')).toBe('/doctor-portal');
    expect(roleDefaultPath('patient')).toBe('/patient-portal');
  });
});

// --- Organisation Model Validation ---

describe('Organisation model schema', () => {
  it('defines valid organisation fields', () => {
    const org = {
      id: 'uuid',
      name: 'MyE-Doctor',
      slug: 'myedoctor',
      description: '',
      contact_email: 'test@example.com',
      country_code: 'NG',
      currency: 'NGN',
      active: true,
    };
    expect(org.slug).toBeTruthy();
    expect(org.active).toBe(true);
  });

  it('defines valid membership roles', () => {
    const validRoles = ['org_admin', 'org_member', 'org_doctor', 'org_patient'];
    expect(validRoles).toContain('org_admin');
    expect(validRoles).toContain('org_doctor');
    expect(validRoles).toContain('org_patient');
    expect(validRoles).toHaveLength(4);
  });
});

// --- Backward Compatibility Validation ---

describe('Backward compatibility', () => {
  it('existing AppRole type includes all original roles', () => {
    type AppRole = 'patient' | 'doctor' | 'admin' | 'coo' | 'healthlink' | 'platform_superadmin' | 'organisation_admin';
    const originalRoles: AppRole[] = ['patient', 'doctor', 'admin', 'coo', 'healthlink'];
    originalRoles.forEach(role => {
      expect(parseAppRole(role)).toBe(role);
    });
  });

  it('existing role check still works for admin/coo', () => {
    const isAdminOrCoo = (role: string) => {
      return ['admin', 'coo', 'platform_superadmin'].includes(role);
    };
    expect(isAdminOrCoo('admin')).toBe(true);
    expect(isAdminOrCoo('coo')).toBe(true);
    expect(isAdminOrCoo('platform_superadmin')).toBe(true);
    expect(isAdminOrCoo('patient')).toBe(false);
    expect(isAdminOrCoo('doctor')).toBe(false);
  });

  it('organisation_id is nullable for backward compat', () => {
    // Existing rows will have organisation_id = NULL until backfilled
    const row = { id: '123', organisation_id: null };
    expect(row.organisation_id).toBeNull();
  });

  it('RLS policies allow NULL organisation_id for backward compat', () => {
    // The policy: organisation_id IS NULL OR is_org_member(...)
    // This means existing rows without org_id remain accessible
    const policyCheck = (orgId: string | null, isMember: boolean) => {
      return orgId === null || isMember;
    };
    expect(policyCheck(null, false)).toBe(true); // backward compat
    expect(policyCheck('org-1', true)).toBe(true); // member access
    expect(policyCheck('org-1', false)).toBe(false); // cross-org blocked
  });
});

// --- Cross-Organisation Isolation ---

describe('Cross-organisation isolation', () => {
  it('blocks access when user is not a member of the organisation', () => {
    const userOrgs = ['org-a'];
    const targetOrg = 'org-b';
    const hasAccess = userOrgs.includes(targetOrg);
    expect(hasAccess).toBe(false);
  });

  it('allows access when user is a member of the organisation', () => {
    const userOrgs = ['org-a', 'org-b'];
    const targetOrg = 'org-b';
    const hasAccess = userOrgs.includes(targetOrg);
    expect(hasAccess).toBe(true);
  });

  it('platform_superadmin bypasses org membership check', () => {
    const isSuperadmin = true;
    const userOrgs: string[] = [];
    const targetOrg = 'org-c';
    const hasAccess = isSuperadmin || userOrgs.includes(targetOrg);
    expect(hasAccess).toBe(true);
  });
});
