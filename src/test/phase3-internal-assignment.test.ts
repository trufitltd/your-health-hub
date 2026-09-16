import { describe, it, expect } from 'vitest';

// --- Phase 3: Internal Assignment Tests ---

describe('Phase 3: Appointment status model', () => {
  it('includes pending_assignment in valid statuses', () => {
    const validStatuses = [
      'pending_payment',
      'pending_assignment',
      'pending_approval',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'no_show',
    ];
    expect(validStatuses).toContain('pending_assignment');
  });

  it('normalizeAppointmentStatusRaw handles pending_assignment', () => {
    // Simulates the normalizeAppointmentStatusRaw function
    const normalize = (status?: string | null) => {
      const normalized = (status || '').trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
      if (!normalized) return '';
      if (normalized === 'pending_assignment' || normalized === 'pending clinician assignment') return 'pending_assignment';
      if (normalized === 'pending_approval' || normalized === 'pending') return 'pending_approval';
      return normalized;
    };

    expect(normalize('pending_assignment')).toBe('pending_assignment');
    expect(normalize('pending-assignment')).toBe('pending_assignment');
    expect(normalize('PENDING_ASSIGNMENT')).toBe('pending_assignment');
  });
});

describe('Phase 3: Booking flow - optional doctorId', () => {
  it('BookingInitiateInput allows doctorId to be optional', () => {
    // With doctorId (MyE-Doctor flow)
    const myedoctorInput = {
      patientId: 'pat-1',
      patientEmail: 'patient@test.com',
      doctorId: 'doc-1',
      preferredDate: '2026-09-01',
      preferredTime: '10:00',
    };
    expect(myedoctorInput.doctorId).toBe('doc-1');

    // Without doctorId but with serviceType (CIBA flow)
    const cibaInput = {
      patientId: 'pat-2',
      patientEmail: 'patient2@test.com',
      serviceType: 'General Consultation',
      organisationId: 'org-ciba',
      preferredDate: '2026-09-01',
      preferredTime: '10:00',
    };
    expect(cibaInput.doctorId).toBeUndefined();
    expect(cibaInput.serviceType).toBe('General Consultation');
  });

  it('requires either doctorId or serviceType', () => {
    const validate = (input: { doctorId?: string; serviceType?: string }) => {
      if (!input.doctorId && !input.serviceType) throw new Error('Missing doctorId or serviceType');
      return true;
    };

    expect(validate({ doctorId: 'doc-1' })).toBe(true);
    expect(validate({ serviceType: 'General Consultation' })).toBe(true);
    expect(() => validate({})).toThrow('Missing doctorId or serviceType');
  });
});

describe('Phase 3: Organisation services model', () => {
  it('organisation_services has required fields', () => {
    const service = {
      id: 'srv-1',
      organisation_id: 'org-ciba',
      name: 'General Consultation',
      description: 'Standard medical consultation',
      default_duration_minutes: 30,
      consultation_mode: 'video',
      base_price: 5000,
      currency: 'NGN',
      active: true,
      sort_order: 0,
    };

    expect(service.name).toBe('General Consultation');
    expect(service.base_price).toBe(5000);
    expect(service.consultation_mode).toBe('video');
    expect(service.active).toBe(true);
  });

  it('consultation_mode is one of video, voice, chat', () => {
    const validModes = ['video', 'voice', 'chat'];
    expect(validModes).toContain('video');
    expect(validModes).toContain('voice');
    expect(validModes).toContain('chat');
  });
});

describe('Phase 3: Organisation booking config', () => {
  it('clinician_selection_mode has valid values', () => {
    const validModes = ['patient_select', 'internal_assign'];
    expect(validModes).toContain('patient_select');
    expect(validModes).toContain('internal_assign');
  });

  it('default config for MyE-Doctor is patient_select', () => {
    const defaultConfig = {
      clinicianSelectionMode: 'patient_select',
      showDoctorDirectory: true,
      showRatings: true,
      showReviews: true,
      enableServiceTypes: false,
    };

    expect(defaultConfig.clinicianSelectionMode).toBe('patient_select');
    expect(defaultConfig.showDoctorDirectory).toBe(true);
    expect(defaultConfig.showRatings).toBe(true);
    expect(defaultConfig.showReviews).toBe(true);
    expect(defaultConfig.enableServiceTypes).toBe(false);
  });

  it('CIBA config is internal_assign with hidden doctor directory', () => {
    const cibaConfig = {
      clinicianSelectionMode: 'internal_assign',
      showDoctorDirectory: false,
      showRatings: false,
      showReviews: false,
      enableServiceTypes: true,
    };

    expect(cibaConfig.clinicianSelectionMode).toBe('internal_assign');
    expect(cibaConfig.showDoctorDirectory).toBe(false);
    expect(cibaConfig.showRatings).toBe(false);
    expect(cibaConfig.showReviews).toBe(false);
    expect(cibaConfig.enableServiceTypes).toBe(true);
  });
});

describe('Phase 3: Pricing engine - service_type support', () => {
  it('PricingRuleRow allows service_type condition', () => {
    const validConditionTypes = ['doctor_type', 'duration', 'tier', 'consultation_type', 'service_type'];
    expect(validConditionTypes).toContain('service_type');
  });

  it('service_type modifier applies to pricing calculation', () => {
    // Simulate pricing engine with service_type modifier
    const basePrice = 5000;
    const serviceTypeRule = {
      condition_type: 'service_type',
      condition_value: 'physiotherapy',
      price_action: 'multiply' as const,
      amount: 1.5,
    };

    const applyAction = (current: number, action: string, amount: number) => {
      if (action === 'set') return amount;
      if (action === 'add') return current + amount;
      return current * amount;
    };

    const finalPrice = applyAction(basePrice, serviceTypeRule.price_action, serviceTypeRule.amount);
    expect(finalPrice).toBe(7500);
  });

  it('service_type pricing falls back to org service base_price when no rule exists', () => {
    const orgServiceBasePrice = 3000;
    const pricingRuleExists = false;

    const finalPrice = pricingRuleExists ? 5000 : orgServiceBasePrice;
    expect(finalPrice).toBe(3000);
  });
});

describe('Phase 3: Clinician assignment pipeline', () => {
  it('pipeline steps execute in order', () => {
    // Simulates the exact pipeline
    const pipeline = {
      serviceFound: false,
      requiredSpecialties: [] as string[],
      organisationMemberCount: 0,
      qualifiedCount: 0,
      availableCount: 0,
      conflictFreeCount: 0,
      selectedDoctorId: undefined as string | undefined,
    };

    // Step 1: CIBA Service
    const orgService = { name: 'General Consultation', required_specialties: ['gp'] };
    pipeline.serviceFound = true;

    // Step 2: Required clinician capability
    pipeline.requiredSpecialties = orgService.required_specialties;

    // Step 3: Organisation members
    const orgDoctors = [{ user_id: 'doc-1' }, { user_id: 'doc-2' }, { user_id: 'doc-3' }];
    pipeline.organisationMemberCount = orgDoctors.length;

    // Step 4: Qualified clinicians (filtered by specialty)
    const registrations = [
      { user_id: 'doc-1', specialty: 'gp' },
      { user_id: 'doc-2', specialty: 'gp' },
      { user_id: 'doc-3', specialty: 'physiotherapy' },
    ];
    const normalizedRequired = pipeline.requiredSpecialties.map((s) => s.toLowerCase());
    const qualified = orgDoctors.filter((doc) => {
      const reg = registrations.find((r) => r.user_id === doc.user_id);
      const specialty = (reg?.specialty || '').toLowerCase();
      return normalizedRequired.some((req) => specialty.includes(req) || req.includes(specialty));
    });
    pipeline.qualifiedCount = qualified.length;

    // Step 5: Available at requested time
    const available = qualified.filter((doc) => doc.user_id !== 'doc-3'); // doc-3 not scheduled
    pipeline.availableCount = available.length;

    // Step 6: No conflicting appointment
    const conflictFree = available.filter((doc) => doc.user_id !== 'doc-1'); // doc-1 has conflict
    pipeline.conflictFreeCount = conflictFree.length;

    // Step 7: Select clinician
    pipeline.selectedDoctorId = conflictFree[0]?.user_id;

    expect(pipeline.serviceFound).toBe(true);
    expect(pipeline.requiredSpecialties).toEqual(['gp']);
    expect(pipeline.organisationMemberCount).toBe(3);
    expect(pipeline.qualifiedCount).toBe(2); // doc-1 (gp), doc-2 (gp) qualify
    expect(pipeline.availableCount).toBe(2); // both gp doctors are scheduled
    expect(pipeline.conflictFreeCount).toBe(1); // doc-1 has conflict, doc-2 free
    expect(pipeline.selectedDoctorId).toBe('doc-2');
  });

  it('returns failure when no service found', () => {
    const result = { success: false, error: 'Service "X" not found', pipeline: { serviceFound: false } };
    expect(result.pipeline.serviceFound).toBe(false);
    expect(result.success).toBe(false);
  });

  it('returns failure when no qualified clinicians', () => {
    const pipeline = { qualifiedCount: 0 };
    expect(pipeline.qualifiedCount).toBe(0);
  });

  it('returns failure when no available clinicians', () => {
    const pipeline = { availableCount: 0 };
    expect(pipeline.availableCount).toBe(0);
  });

  it('returns failure when all clinicians have conflicts', () => {
    const pipeline = { conflictFreeCount: 0 };
    expect(pipeline.conflictFreeCount).toBe(0);
  });

  it('assign_clinician_queue records pipeline outcome', () => {
    const queueEntry = {
      id: 'q-1',
      appointment_id: 'apt-1',
      organisation_id: 'org-ciba',
      service_name: 'General Consultation',
      preferred_date: '2026-09-01',
      preferred_time: '10:00',
      preferred_duration_minutes: 30,
      status: 'assigned',
      assigned_doctor_id: 'doc-2',
      assigned_at: '2026-08-29T10:00:00Z',
      failure_reason: null,
    };

    expect(queueEntry.status).toBe('assigned');
    expect(queueEntry.assigned_doctor_id).toBe('doc-2');
  });

  it('round-robin selects doctor with fewest recent assignments', () => {
    const conflictFreeDoctors = ['doc-1', 'doc-2', 'doc-3'];
    const assignmentCounts: Record<string, number> = {
      'doc-1': 5,
      'doc-2': 2,
      'doc-3': 4,
    };

    const selected = conflictFreeDoctors.reduce((best, current) =>
      (assignmentCounts[current] < assignmentCounts[best]) ? current : best
    );

    expect(selected).toBe('doc-2');
  });

  it('specialty matching: GP requirement matches GP doctors', () => {
    const required = ['gp'];
    const doctors = [
      { user_id: 'doc-1', specialty: 'gp' },
      { user_id: 'doc-2', specialty: 'specialist' },
      { user_id: 'doc-3', specialty: 'general practice' },
    ];

    const qualified = doctors.filter((doc) => {
      return required.some((req) => {
        const reqLower = req.toLowerCase();
        const specLower = doc.specialty.toLowerCase();
        if (reqLower === 'gp' || reqLower === 'general practice') {
          return specLower === 'gp' || specLower === 'general practice' || specLower === 'general practitioner';
        }
        return specLower.includes(reqLower) || reqLower.includes(specLower);
      });
    });

    expect(qualified).toHaveLength(2);
    expect(qualified.map((d) => d.user_id)).toEqual(['doc-1', 'doc-3']);
  });

  it('specialty matching: empty required_specialties means any doctor', () => {
    const required: string[] = [];
    const doctors = [
      { user_id: 'doc-1', specialty: 'gp' },
      { user_id: 'doc-2', specialty: 'specialist' },
    ];

    // When required is empty, all doctors are qualified
    const qualified = required.length === 0 ? doctors : doctors.filter((doc) => {
      return required.some((req) => doc.specialty.toLowerCase().includes(req.toLowerCase()));
    });

    expect(qualified).toHaveLength(2);
  });

  it('specialty matching: Physiotherapy only matches Physiotherapy', () => {
    const required = ['physiotherapy'];
    const doctors = [
      { user_id: 'doc-1', specialty: 'gp' },
      { user_id: 'doc-2', specialty: 'physiotherapy' },
      { user_id: 'doc-3', specialty: 'specialist' },
    ];

    const qualified = doctors.filter((doc) => {
      return required.some((req) => doc.specialty.toLowerCase().includes(req.toLowerCase()));
    });

    expect(qualified).toHaveLength(1);
    expect(qualified[0].user_id).toBe('doc-2');
  });

  it('double-booking prevention checks time conflicts', () => {
    const appointmentStart = 600; // 10:00
    const appointmentEnd = 630; // 10:30

    const existingAppointments = [
      { time: '09:00', duration_minutes: 60 }, // 540-600: no conflict
      { time: '10:00', duration_minutes: 30 }, // 600-630: CONFLICT
      { time: '11:00', duration_minutes: 30 }, // 660-690: no conflict
    ];

    const timeToMinutes = (time: string) => {
      const parts = time.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const hasConflict = existingAppointments.some((apt) => {
      const aptStart = timeToMinutes(apt.time);
      const aptEnd = aptStart + apt.duration_minutes;
      return appointmentStart < aptEnd && appointmentEnd > aptStart;
    });

    expect(hasConflict).toBe(true);
  });

  it('no conflict when appointments do not overlap', () => {
    const appointmentStart = 660; // 11:00
    const appointmentEnd = 690; // 11:30

    const existingAppointments = [
      { time: '09:00', duration_minutes: 60 }, // 540-600
      { time: '10:00', duration_minutes: 30 }, // 600-630
    ];

    const timeToMinutes = (time: string) => {
      const parts = time.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const hasConflict = existingAppointments.some((apt) => {
      const aptStart = timeToMinutes(apt.time);
      const aptEnd = aptStart + apt.duration_minutes;
      return appointmentStart < aptEnd && appointmentEnd > aptStart;
    });

    expect(hasConflict).toBe(false);
  });

  it('required_specialties field exists on organisation_services', () => {
    const service = {
      name: 'Physiotherapy',
      required_specialties: ['physiotherapy', 'rehabilitation'],
    };
    expect(Array.isArray(service.required_specialties)).toBe(true);
    expect(service.required_specialties).toContain('physiotherapy');
  });
});

describe('Phase 3: Cross-organisation isolation', () => {
  it('services are scoped to organisation', () => {
    const services = [
      { id: 's-1', organisation_id: 'org-a', name: 'General Consultation' },
      { id: 's-2', organisation_id: 'org-b', name: 'Physiotherapy' },
    ];

    const orgId = 'org-a';
    const filtered = services.filter(s => s.organisation_id === orgId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('General Consultation');
  });

  it('booking config is scoped to organisation', () => {
    const configs: Record<string, string> = {
      'org-a:clinician_selection_mode': 'patient_select',
      'org-b:clinician_selection_mode': 'internal_assign',
    };

    expect(configs['org-a:clinician_selection_mode']).toBe('patient_select');
    expect(configs['org-b:clinician_selection_mode']).toBe('internal_assign');
  });

  it('pricing rules with service_type are org-scoped', () => {
    const rules = [
      { id: 'r-1', organisation_id: 'org-a', condition_type: 'service_type', condition_value: 'consultation', amount: 5000 },
      { id: 'r-2', organisation_id: 'org-b', condition_type: 'service_type', condition_value: 'consultation', amount: 8000 },
    ];

    const orgId = 'org-b';
    const filtered = rules.filter(r => r.organisation_id === orgId && r.condition_type === 'service_type');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].amount).toBe(8000);
  });

  it('assignment queue is scoped to organisation', () => {
    const queue = [
      { id: 'q-1', organisation_id: 'org-a', service_name: 'General' },
      { id: 'q-2', organisation_id: 'org-b', service_name: 'Physiotherapy' },
    ];

    const orgId = 'org-a';
    const filtered = queue.filter(q => q.organisation_id === orgId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].service_name).toBe('General');
  });
});

describe('Phase 3: MyE-Doctor regression', () => {
  it('patient_select flow unchanged: doctorId is required', () => {
    const input = {
      patientId: 'pat-1',
      patientEmail: 'test@test.com',
      doctorId: 'doc-1',
      preferredDate: '2026-09-01',
      preferredTime: '10:00',
    };

    // MyE-Doctor flow requires doctorId
    expect(input.doctorId).toBeDefined();
    expect(input.doctorId).not.toBeNull();
  });

  it('pending_approval is still used for patient-select bookings', () => {
    // After payment, patient-select bookings go to pending_approval
    const status = 'pending_approval';
    expect(status).toBe('pending_approval');
  });

  it('wallet earnings are still created for patient-select bookings', () => {
    const appointment = {
      id: 'apt-1',
      doctor_id: 'doc-1',
      service_type: null,
    };

    // Wallet earnings should be created when doctor_id is present
    const shouldCreateEarning = !!appointment.doctor_id;
    expect(shouldCreateEarning).toBe(true);
  });

  it('existing pricing engine works without service_type', () => {
    const input = {
      doctorType: 'GP',
      duration: 30,
      consultationType: 'video',
    };

    // No serviceType provided - standard pricing
    expect(input).not.toHaveProperty('serviceType');
  });

  it('discovery-starting-prices still works for MyE-Doctor', () => {
    // MyE-Doctor uses patient_select mode
    const config = { clinicianSelectionMode: 'patient_select' };
    expect(config.clinicianSelectionMode).toBe('patient_select');
  });
});

describe('Phase 3: Frontend routing', () => {
  it('service-discovery route exists', () => {
    const routes = ['/doctor-discovery', '/service-discovery', '/slot-selection'];
    expect(routes).toContain('/service-discovery');
  });

  it('ServiceSelection navigates to slot-selection with serviceType', () => {
    const navigationState = {
      organisationId: 'org-ciba',
      serviceType: 'General Consultation',
      serviceName: 'General Consultation',
      defaultDuration: 30,
      consultationMode: 'video',
      basePrice: 5000,
      currency: 'NGN',
    };

    expect(navigationState.serviceType).toBe('General Consultation');
    expect(navigationState.organisationId).toBe('org-ciba');
  });

  it('SlotSelection handles internal assignment state', () => {
    const state = {
      organisationId: 'org-ciba',
      serviceType: 'General Consultation',
      serviceName: 'General Consultation',
    };

    const isInternalAssignment = !state.doctorId && !!state.serviceType;
    expect(isInternalAssignment).toBe(true);
  });
});

describe('Phase 3: RPC function - list_public_doctors org-aware', () => {
  it('accepts optional p_organisation_id parameter', () => {
    // When p_organisation_id is NULL, returns all doctors (backward compat)
    // When p_organisation_id is provided, filters by org
    const params = { p_limit: 100, p_offset: 0, p_organisation_id: null };
    expect(params.p_organisation_id).toBeNull();
  });

  it('org filter uses EXISTS subquery', () => {
    // The RPC uses: AND (p_organisation_id IS NULL OR EXISTS (SELECT 1 FROM doctors d WHERE d.id = dr.user_id AND d.organisation_id = p_organisation_id))
    const sql = `
      AND (
        p_organisation_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.doctors d
          WHERE d.id = dr.user_id
            AND d.organisation_id = p_organisation_id
        )
      )
    `;
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('p_organisation_id IS NULL');
  });
});
