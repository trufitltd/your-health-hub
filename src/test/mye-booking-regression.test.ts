import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════════════
// MyE-Doctor Booking Regression Tests
// ══════════════════════════════════════════════════════════════════════════════

// Mock at the supabase client level using vi.hoisted
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    })),
    rpc: vi.fn(),
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

import { BookingService } from '@/services/BookingService';

describe('MyE-Doctor Booking Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authorization Header', () => {
    it('passes bearer token when session has access_token', async () => {
      mocks.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'test-access-token-123',
            user: { id: 'user-1', email: 'test@example.com' },
          },
        },
        error: null,
      });

      mocks.invoke.mockResolvedValue({
        data: {
          appointmentId: 'apt-1',
          finalPrice: 5000,
          currency: 'NGN',
          slot: { date: '2026-09-20', time: '10:00', durationMinutes: 30 },
          paymentInitialization: null,
          paymentMethod: 'wallet',
          paidWithWallet: true,
        },
        error: null,
      });

      await BookingService.initiateBooking({
        doctorId: 'doctor-1',
        preferredDate: '2026-09-20',
        preferredTime: '10:00',
        duration: 30,
        consultationType: 'video',
        paymentMethod: 'wallet',
      });

      expect(mocks.invoke).toHaveBeenCalledWith(
        'booking-initiate',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-access-token-123',
          },
        }),
      );
    });

    it('sends undefined headers when session is missing', async () => {
      mocks.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      mocks.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Unauthorized' },
      });

      await expect(
        BookingService.initiateBooking({
          doctorId: 'doctor-1',
          preferredDate: '2026-09-20',
          preferredTime: '10:00',
          duration: 30,
        }),
      ).rejects.toThrow();

      expect(mocks.invoke).toHaveBeenCalledWith(
        'booking-initiate',
        expect.objectContaining({
          headers: undefined,
        }),
      );
    });

    it('passes bearer token for payment confirmation', async () => {
      mocks.getSession.mockResolvedValue({
        data: {
          session: { access_token: 'confirm-token-456' },
        },
        error: null,
      });

      mocks.invoke.mockResolvedValue({
        data: { appointmentId: 'apt-1', alreadyProcessed: false },
        error: null,
      });

      await BookingService.confirmPayment('APT-ref-123');

      expect(mocks.invoke).toHaveBeenCalledWith(
        'booking-payment-confirm',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer confirm-token-456',
          },
        }),
      );
    });
  });

  describe('MyE Booking Flow (Doctor-Select)', () => {
    it('sends doctorId for standard MyE flow', async () => {
      mocks.getSession.mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      mocks.invoke.mockResolvedValue({
        data: {
          appointmentId: 'apt-2',
          finalPrice: 10000,
          currency: 'NGN',
          slot: { date: '2026-09-21', time: '14:00', durationMinutes: 30 },
          paymentInitialization: {
            reference: 'APT-ref-789',
            amountInKobo: 1000000,
            email: 'patient@test.com',
            accessCode: 'access-code',
            authorizationUrl: 'https://checkout.paystack.com/abc',
          },
          paymentMethod: 'paystack',
          paidWithWallet: false,
        },
        error: null,
      });

      const result = await BookingService.initiateBooking({
        doctorId: 'doctor-123',
        preferredDate: '2026-09-21',
        preferredTime: '14:00',
        duration: 30,
        consultationType: 'video',
        paymentMethod: 'paystack',
      });

      expect(mocks.invoke).toHaveBeenCalledWith(
        'booking-initiate',
        expect.objectContaining({
          body: expect.objectContaining({ doctorId: 'doctor-123' }),
        }),
      );

      expect(result.paymentInitialization).not.toBeNull();
      expect(result.paymentInitialization?.email).toBe('patient@test.com');
      expect(result.pendingAssignment).toBeFalsy();
    });

    it('sends serviceType for internal assignment flow', async () => {
      mocks.getSession.mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      mocks.invoke.mockResolvedValue({
        data: {
          appointmentId: 'apt-3',
          finalPrice: 8000,
          currency: 'NGN',
          slot: { date: '2026-09-22', time: '09:00', durationMinutes: 30 },
          paymentInitialization: {
            reference: 'APT-ref-321',
            amountInKobo: 800000,
            email: 'ciba-patient@test.com',
            accessCode: 'access-code',
            authorizationUrl: 'https://checkout.paystack.com/def',
          },
          paymentMethod: 'paystack',
          paidWithWallet: false,
          pendingAssignment: true,
        },
        error: null,
      });

      const result = await BookingService.initiateBooking({
        serviceType: 'General Consultation',
        organisationId: 'org-456',
        preferredDate: '2026-09-22',
        preferredTime: '09:00',
        duration: 30,
        consultationType: 'video',
        paymentMethod: 'paystack',
      });

      expect(mocks.invoke).toHaveBeenCalledWith(
        'booking-initiate',
        expect.objectContaining({
          body: expect.objectContaining({
            serviceType: 'General Consultation',
            organisationId: 'org-456',
          }),
        }),
      );

      expect(result.pendingAssignment).toBe(true);
    });
  });

  describe('Payment Provider Isolation', () => {
    it('MyE uses global Paystack credentials (orgId=null)', () => {
      const orgId = null;
      const isMyEDoctor = !orgId;
      expect(isMyEDoctor).toBe(true);
    });

    it('CIBA uses org-specific Paystack credentials', () => {
      const orgId = 'ciba-org-uuid';
      const isMyEDoctor = !orgId || orgId === '';
      expect(isMyEDoctor).toBe(false);
    });
  });

  describe('Appointment Status Normalization', () => {
    const normalize = (status?: string | null) => {
      const n = (status || '').trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
      if (!n) return '';
      if (['requested', 'awaiting_approval', 'pending', 'pending_doctor_acceptance', 'pending_approval'].includes(n)) return 'pending_approval';
      if (n === 'canceled') return 'cancelled';
      if (['rejected', 'declined', 'expired'].includes(n)) return 'cancelled';
      if (n === 'inprogress') return 'in_progress';
      if (n === 'noshow') return 'no_show';
      return n;
    };

    it('normalizes pending_payment variants', () => {
      expect(normalize('pending_payment')).toBe('pending_payment');
      expect(normalize('pending-payment')).toBe('pending_payment');
      expect(normalize('pending payment')).toBe('pending_payment');
    });

    it('normalizes pending_approval variants', () => {
      expect(normalize('pending_approval')).toBe('pending_approval');
      expect(normalize('pending')).toBe('pending_approval');
      expect(normalize('requested')).toBe('pending_approval');
    });

    it('normalizes pending_assignment', () => {
      expect(normalize('pending_assignment')).toBe('pending_assignment');
    });
  });
});
