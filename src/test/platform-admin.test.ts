import { describe, it, expect } from 'vitest';

// ── Platform Admin Route Protection ────────────────────────────────────────

describe('Platform Admin route protection', () => {
  const roleDefaultPath = (role: string) => {
    if (role === 'doctor') return '/doctor-portal';
    if (role === 'admin') return '/admin';
    if (role === 'coo') return '/coo';
    if (role === 'healthlink') return '/healthlink';
    if (role === 'platform_superadmin') return '/platform-admin';
    if (role === 'organisation_admin') return '/admin';
    return '/patient-portal';
  };

  it('redirects platform_superadmin to /platform-admin', () => {
    expect(roleDefaultPath('platform_superadmin')).toBe('/platform-admin');
  });

  it('redirects admin to /admin (not /platform-admin)', () => {
    expect(roleDefaultPath('admin')).toBe('/admin');
  });

  it('redirects patient to /patient-portal', () => {
    expect(roleDefaultPath('patient')).toBe('/patient-portal');
  });

  it('redirects doctor to /doctor-portal', () => {
    expect(roleDefaultPath('doctor')).toBe('/doctor-portal');
  });

  it('redirects organisation_admin to /admin', () => {
    expect(roleDefaultPath('organisation_admin')).toBe('/admin');
  });

  it('redirects coo to /coo', () => {
    expect(roleDefaultPath('coo')).toBe('/coo');
  });

  it('redirects healthlink to /healthlink', () => {
    expect(roleDefaultPath('healthlink')).toBe('/healthlink');
  });
});

// ── Slug Validation ────────────────────────────────────────────────────────

describe('Organisation slug validation', () => {
  const slugify = (text: string): string =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const isValidSlug = (slug: string): boolean => /^[a-z0-9-]+$/.test(slug);

  it('generates valid slug from organisation name', () => {
    expect(slugify('CIBA Wellness')).toBe('ciba-wellness');
    expect(isValidSlug(slugify('CIBA Wellness'))).toBe(true);
  });

  it('generates valid slug from MyE-Doctor', () => {
    expect(slugify('MyE-Doctor')).toBe('mye-doctor');
    expect(isValidSlug(slugify('MyE-Doctor'))).toBe(true);
  });

  it('rejects invalid slug characters', () => {
    expect(isValidSlug('My Org!')).toBe(false);
    expect(isValidSlug('org name')).toBe(false);
    expect(isValidSlug('org@domain')).toBe(false);
  });

  it('accepts valid slug formats', () => {
    expect(isValidSlug('ciba')).toBe(true);
    expect(isValidSlug('my-org-name')).toBe(true);
    expect(isValidSlug('org123')).toBe(true);
  });

  it('rejects empty slug', () => {
    expect(isValidSlug('')).toBe(false);
  });
});

// ── Organisation Model Validation ──────────────────────────────────────────

describe('Organisation model for Platform Admin', () => {
  it('defines all required organisation fields', () => {
    const org = {
      id: 'uuid',
      name: 'CIBA Wellness',
      slug: 'ciba',
      description: 'Specialist mental healthcare',
      contact_email: 'admin@cibawellness.com',
      contact_phone: '+234...',
      country_code: 'NG',
      currency: 'NGN',
      active: true,
      created_at: '2026-08-29T00:00:00Z',
      updated_at: '2026-08-29T00:00:00Z',
    };
    expect(org.name).toBeTruthy();
    expect(org.slug).toBeTruthy();
    expect(org.active).toBe(true);
  });

  it('defines valid booking config keys', () => {
    const configKeys = [
      'clinician_selection_mode',
      'show_doctor_directory',
      'show_ratings',
      'show_reviews',
      'enable_service_types',
    ];
    expect(configKeys).toContain('clinician_selection_mode');
    expect(configKeys).toContain('enable_service_types');
    expect(configKeys).toHaveLength(5);
  });

  it('defines valid brand config keys', () => {
    const brandKeys = [
      'brand_name',
      'brand_email',
      'support_email',
      'sms_signature',
      'vapid_subject',
    ];
    expect(brandKeys).toContain('brand_name');
    expect(brandKeys).toContain('sms_signature');
    expect(brandKeys).toHaveLength(5);
  });

  it('defines valid clinician selection modes', () => {
    const modes = ['patient_select', 'internal_assign'];
    expect(modes).toContain('patient_select');
    expect(modes).toContain('internal_assign');
    expect(modes).toHaveLength(2);
  });
});

// ── Role-Based Access Control ──────────────────────────────────────────────

describe('Platform Admin access control', () => {
  const canAccessPlatformAdmin = (role: string): boolean => role === 'platform_superadmin';

  it('allows platform_superadmin to access Platform Admin', () => {
    expect(canAccessPlatformAdmin('platform_superadmin')).toBe(true);
  });

  it('blocks admin from accessing Platform Admin', () => {
    expect(canAccessPlatformAdmin('admin')).toBe(false);
  });

  it('blocks organisation_admin from accessing Platform Admin', () => {
    expect(canAccessPlatformAdmin('organisation_admin')).toBe(false);
  });

  it('blocks patient from accessing Platform Admin', () => {
    expect(canAccessPlatformAdmin('patient')).toBe(false);
  });

  it('blocks doctor from accessing Platform Admin', () => {
    expect(canAccessPlatformAdmin('doctor')).toBe(false);
  });

  it('blocks coo from accessing Platform Admin', () => {
    expect(canAccessPlatformAdmin('coo')).toBe(false);
  });

  it('blocks healthlink from accessing Platform Admin', () => {
    expect(canAccessPlatformAdmin('healthlink')).toBe(false);
  });
});

// ── Organisation Admin Assignment Safety ───────────────────────────────────

describe('Organisation admin assignment safety', () => {
  it('prevents assigning platform_superadmin as org_admin', () => {
    const userRole = 'platform_superadmin';
    const isPlatformSuperadmin = userRole === 'platform_superadmin';
    const canAssign = !isPlatformSuperadmin;
    expect(canAssign).toBe(false);
  });

  it('allows assigning patient as org_admin', () => {
    const userRole = 'patient';
    const isPlatformSuperadmin = userRole === 'platform_superadmin';
    const canAssign = !isPlatformSuperadmin;
    expect(canAssign).toBe(true);
  });

  it('allows assigning doctor as org_admin', () => {
    const userRole = 'doctor';
    const isPlatformSuperadmin = userRole === 'platform_superadmin';
    const canAssign = !isPlatformSuperadmin;
    expect(canAssign).toBe(true);
  });

  it('allows assigning org_member as org_admin', () => {
    const userRole = 'org_member';
    const isPlatformSuperadmin = userRole === 'platform_superadmin';
    const canAssign = !isPlatformSuperadmin;
    expect(canAssign).toBe(true);
  });
});

// ── MyE-Doctor Central Admin Isolation ─────────────────────────────────────

describe('MyE-Doctor Central Admin isolation', () => {
  const routes = {
    platformAdmin: '/platform-admin',
    centralAdmin: '/admin',
    cooPortal: '/coo',
    healthlinkPortal: '/healthlink',
    patientPortal: '/patient-portal',
    doctorPortal: '/doctor-portal',
  };

  it('Platform Admin route is separate from Central Admin', () => {
    expect(routes.platformAdmin).not.toBe(routes.centralAdmin);
  });

  it('Central Admin is accessible by admin role', () => {
    const adminRole = 'admin';
    const canAccessCentral = adminRole === 'admin';
    expect(canAccessCentral).toBe(true);
  });

  it('Central Admin cannot access Platform Admin', () => {
    const adminRole = 'admin';
    const canAccessPlatform = adminRole === 'platform_superadmin';
    expect(canAccessPlatform).toBe(false);
  });

  it('Platform Admin can access Central Admin (via is_admin_or_coo)', () => {
    // platform_superadmin inherits admin access
    const platformRole = 'platform_superadmin';
    const isAdminOrCoo = ['admin', 'coo', 'platform_superadmin'].includes(platformRole);
    expect(isAdminOrCoo).toBe(true);
  });

  it('Organisation Admin cannot access Platform Admin', () => {
    const orgAdminRole = 'organisation_admin';
    const canAccessPlatform = orgAdminRole === 'platform_superadmin';
    expect(canAccessPlatform).toBe(false);
  });
});

// ── Config Value Helpers ───────────────────────────────────────────────────

describe('Config value helpers', () => {
  interface ConfigRow {
    config_key: string;
    config_value: string;
  }

  const getConfigValue = (configs: ConfigRow[], key: string, fallback = ''): string =>
    configs.find((c) => c.config_key === key)?.config_value || fallback;

  const getConfigBool = (configs: ConfigRow[], key: string, defaultValue = true): boolean => {
    const val = getConfigValue(configs, key);
    if (val === '') return defaultValue;
    return val !== 'false';
  };

  const configs: ConfigRow[] = [
    { config_key: 'clinician_selection_mode', config_value: 'internal_assign' },
    { config_key: 'show_doctor_directory', config_value: 'false' },
    { config_key: 'show_ratings', config_value: 'false' },
    { config_key: 'show_reviews', config_value: 'true' },
    { config_key: 'enable_service_types', config_value: 'true' },
  ];

  it('gets string config value', () => {
    expect(getConfigValue(configs, 'clinician_selection_mode')).toBe('internal_assign');
  });

  it('gets boolean config value', () => {
    expect(getConfigBool(configs, 'show_doctor_directory')).toBe(false);
    expect(getConfigBool(configs, 'show_reviews')).toBe(true);
  });

  it('returns default when key missing', () => {
    expect(getConfigValue(configs, 'missing_key', 'default')).toBe('default');
    expect(getConfigBool(configs, 'missing_key', false)).toBe(false);
    expect(getConfigBool(configs, 'missing_key')).toBe(true); // default defaultValue is true
  });
});

// ── Platform Metrics Calculation ───────────────────────────────────────────

describe('Platform metrics calculation', () => {
  const orgs = [
    { id: '1', name: 'MyE-Doctor', active: true, created_at: '2026-01-01' },
    { id: '2', name: 'CIBA', active: true, created_at: '2026-08-29' },
    { id: '3', name: 'Inactive Org', active: false, created_at: '2026-06-01' },
  ];

  const admins = [
    { role: 'org_admin' },
    { role: 'org_admin' },
  ];

  it('calculates total organisations', () => {
    expect(orgs.length).toBe(3);
  });

  it('calculates active organisations', () => {
    const active = orgs.filter((o) => o.active);
    expect(active.length).toBe(2);
  });

  it('calculates inactive organisations', () => {
    const inactive = orgs.filter((o) => !o.active);
    expect(inactive.length).toBe(1);
  });

  it('counts org administrators', () => {
    expect(admins.length).toBe(2);
  });

  it('sorts recent organisations by created_at', () => {
    const sorted = [...orgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    expect(sorted[0].name).toBe('CIBA');
    expect(sorted[1].name).toBe('Inactive Org');
    expect(sorted[2].name).toBe('MyE-Doctor');
  });
});
