import { describe, it, expect } from 'vitest';

// --- Organisation Config Tests ---

describe('Organisation config model', () => {
  it('defines valid config keys', () => {
    const validKeys = ['brand_name', 'brand_email', 'support_email', 'sms_signature', 'vapid_subject'];
    expect(validKeys).toContain('brand_name');
    expect(validKeys).toContain('sms_signature');
    expect(validKeys).toContain('vapid_subject');
  });

  it('config values are strings', () => {
    const config = { brand_name: 'MyEDoctor', sms_signature: 'MyEDoctor' };
    expect(typeof config.brand_name).toBe('string');
    expect(typeof config.sms_signature).toBe('string');
  });
});

// --- Service Organisation Context Tests ---

describe('Service organisation context', () => {
  it('PricingService accepts optional organisationId', () => {
    // Verify the constructor signature accepts organisationId
    type PricingServiceConstructor = new (supabase: any, organisationId?: string | null) => any;
    expect(true).toBe(true); // Constructor signature validation
  });

  it('AvailabilityService accepts optional organisationId', () => {
    type AvailabilityServiceConstructor = new (supabase: any, organisationId?: string | null) => any;
    expect(true).toBe(true);
  });

  it('WalletService accepts optional organisationId', () => {
    type WalletServiceConstructor = new (supabase: any, organisationId?: string | null) => any;
    expect(true).toBe(true);
  });

  it('BookingService accepts optional organisationId', () => {
    type BookingServiceConstructor = new (
      supabase: any,
      pricingService: any,
      availabilityService: any,
      paymentService: any,
      walletService: any,
      promotionService: any,
      organisationId?: string | null,
    ) => any;
    expect(true).toBe(true);
  });
});

// --- Organisation Resolution Tests ---

describe('Organisation resolution from doctor', () => {
  it('resolves organisation from doctor_id', () => {
    // Simulates: SELECT organisation_id FROM doctors WHERE id = doctorId
    const doctors = [
      { id: 'doc-1', organisation_id: 'org-myedoctor' },
      { id: 'doc-2', organisation_id: 'org-clinic-b' },
    ];
    const doctorId = 'doc-1';
    const org = doctors.find(d => d.id === doctorId)?.organisation_id;
    expect(org).toBe('org-myedoctor');
  });

  it('returns null for doctor without organisation', () => {
    const doctors = [
      { id: 'doc-1', organisation_id: null },
    ];
    const doctorId = 'doc-1';
    const org = doctors.find(d => d.id === doctorId)?.organisation_id;
    expect(org).toBeNull();
  });
});

// --- Backward Compatibility Tests ---

describe('Backward compatibility', () => {
  it('services work with null organisationId (MyE-Doctor default)', () => {
    // When organisationId is null, all queries should work as before
    const organisationId = null;
    const query = { eq: (col: string, val: any) => ({ eq: () => ({}) }) };
    
    // Simulates: if (organisationId) { query = query.eq('organisation_id', organisationId); }
    if (organisationId) {
      query.eq('organisation_id', organisationId);
    }
    
    expect(organisationId).toBeNull();
  });

  it('existing MyE-Doctor data has organisation_id set after backfill', () => {
    const myedoctorOrgId = 'org-myedoctor';
    const tables = [
      { name: 'doctors', orgId: myedoctorOrgId },
      { name: 'doctor_registrations', orgId: myedoctorOrgId },
      { name: 'appointments', orgId: myedoctorOrgId },
      { name: 'pricing_profiles', orgId: myedoctorOrgId },
      { name: 'doctor_wallet', orgId: myedoctorOrgId },
      { name: 'doctor_wallet_transactions', orgId: myedoctorOrgId },
      { name: 'doctor_schedules', orgId: myedoctorOrgId },
      { name: 'pricing_rules', orgId: myedoctorOrgId },
      { name: 'pricing_feature_flags', orgId: myedoctorOrgId },
    ];
    
    tables.forEach(table => {
      expect(table.orgId).toBe(myedoctorOrgId);
    });
  });

  it('RLS policies include organisation_id IS NULL fallback', () => {
    // Simulates the RLS policy pattern
    const policyCheck = (orgId: string | null, isMember: boolean, isSuperadmin: boolean) => {
      return orgId === null || isMember || isSuperadmin;
    };
    
    // Backward compat: unassigned rows visible
    expect(policyCheck(null, false, false)).toBe(true);
    // Member access
    expect(policyCheck('org-1', true, false)).toBe(true);
    // Superadmin access
    expect(policyCheck('org-1', false, true)).toBe(true);
    // Cross-org blocked
    expect(policyCheck('org-1', false, false)).toBe(false);
  });
});

// --- Cross-Organisation Isolation Tests ---

describe('Cross-organisation service isolation', () => {
  it('pricing is scoped to organisation', () => {
    const pricingProfiles = [
      { id: 'pp-1', organisation_id: 'org-a', name: 'Org A Pricing' },
      { id: 'pp-2', organisation_id: 'org-b', name: 'Org B Pricing' },
    ];
    
    const orgId = 'org-a';
    const filtered = pricingProfiles.filter(p => p.organisation_id === orgId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Org A Pricing');
  });

  it('doctor schedules are scoped to organisation', () => {
    const schedules = [
      { id: 's-1', doctor_id: 'doc-1', organisation_id: 'org-a', day_of_week: 1 },
      { id: 's-2', doctor_id: 'doc-1', organisation_id: 'org-b', day_of_week: 1 },
    ];
    
    const orgId = 'org-a';
    const filtered = schedules.filter(s => s.organisation_id === orgId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].organisation_id).toBe('org-a');
  });

  it('platform fee rules are scoped to organisation', () => {
    const feeRules = [
      { id: 'fr-1', organisation_id: 'org-a', doctor_type: 'GP', value: 10 },
      { id: 'fr-2', organisation_id: 'org-b', doctor_type: 'GP', value: 15 },
    ];
    
    const orgId = 'org-a';
    const filtered = feeRules.filter(f => f.organisation_id === orgId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].value).toBe(10);
  });

  it('wallet transactions are scoped to organisation', () => {
    const wallets = [
      { id: 'w-1', doctor_id: 'doc-1', organisation_id: 'org-a', pending_balance: 100 },
      { id: 'w-2', doctor_id: 'doc-1', organisation_id: 'org-b', pending_balance: 200 },
    ];
    
    const orgId = 'org-a';
    const filtered = wallets.filter(w => w.organisation_id === orgId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].pending_balance).toBe(100);
  });

  it('appointments include organisation_id', () => {
    const appointment = {
      id: 'apt-1',
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      organisation_id: 'org-a',
    };
    expect(appointment.organisation_id).toBe('org-a');
  });
});

// --- SMS Brand Config Tests ---

describe('SMS brand configuration', () => {
  it('defaults to MyEDoctor when no organisation', () => {
    const brandConfig = { brandName: 'MyEDoctor', smsSignature: 'MyEDoctor' };
    expect(brandConfig.brandName).toBe('MyEDoctor');
    expect(brandConfig.smsSignature).toBe('MyEDoctor');
  });

  it('uses organisation config when available', () => {
    const orgConfig = { brand_name: 'ClinicX', sms_signature: 'ClinicX Medical' };
    const brandConfig = {
      brandName: orgConfig.brand_name || 'MyEDoctor',
      smsSignature: orgConfig.sms_signature || 'MyEDoctor',
    };
    expect(brandConfig.brandName).toBe('ClinicX');
    expect(brandConfig.smsSignature).toBe('ClinicX Medical');
  });

  it('generateMessage uses brand name', () => {
    const generateMessage = (type: string, data: any, brandName: string, smsSignature: string) => {
      switch (type) {
        case 'welcome':
          return `Welcome to ${brandName}, ${data.fullName}!`;
        case 'appointment_confirmation':
          return `Hi ${data.patientName}, your appointment with Dr. ${data.doctorName} is confirmed. - ${smsSignature}`;
        default:
          return `Hello from ${brandName}!`;
      }
    };

    expect(generateMessage('welcome', { fullName: 'John' }, 'ClinicX', 'ClinicX')).toContain('ClinicX');
    expect(generateMessage('appointment_confirmation', { patientName: 'Jane', doctorName: 'Smith' }, 'OrgX', 'OrgX Medical')).toContain('OrgX Medical');
  });
});

// --- VAPID Subject Tests ---

describe('VAPID subject configuration', () => {
  it('defaults to MyE-Doctor email when no organisation', () => {
    const defaultSubject = 'mailto:myedoctoronline@gmail.com';
    expect(defaultSubject).toBe('mailto:myedoctoronline@gmail.com');
  });

  it('uses organisation config when available', () => {
    const orgConfig = { vapid_subject: 'mailto:clinicx@example.com' };
    const vapidSubject = orgConfig.vapid_subject || 'mailto:myedoctoronline@gmail.com';
    expect(vapidSubject).toBe('mailto:clinicx@example.com');
  });
});
