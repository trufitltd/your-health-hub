import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from '../_shared/services/PricingService.ts';
import { AvailabilityService } from '../_shared/services/AvailabilityService.ts';
import { PaymentService } from '../_shared/services/PaymentService.ts';
import { WalletService } from '../_shared/services/WalletService.ts';
import { PromotionService } from '../_shared/services/PromotionService.ts';
import { BookingService } from '../_shared/services/BookingService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase env vars are not configured');
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify user via service role (works with both HS256 and ES256 JWTs)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { data: { user }, error: authError } = token
      ? await serviceClient.auth.getUser(token)
      : { data: { user: null }, error: new Error('No token') };

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();

    const patientEmail = user.email || '';
    const isInternalAssignment = !payload.doctorId && !!payload.serviceType;

    // ── #12: Reject doctorId for internal-assignment bookings ──
    // CIBA internal-assignment must never accept a doctorId from the client.
    if (isInternalAssignment && payload.doctorId) {
      return new Response(JSON.stringify({
        error: 'Internal assignment bookings must not include a doctorId',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve organisation
    let organisationId: string | null = null;

    if (payload.doctorId) {
      // Standard flow: resolve org from the doctor being booked
      const { data: doctorRow } = await serviceClient
        .from('doctors')
        .select('organisation_id')
        .eq('id', payload.doctorId)
        .maybeSingle();
      organisationId = doctorRow?.organisation_id || null;
    } else if (isInternalAssignment && payload.organisationId) {
      // ── #1: Trusted tenant validation ──
      // The browser-provided organisationId is a CLAIMED context.
      // We MUST verify it server-side before trusting it.
      //
      // Validation steps:
      //   1. Organisation must exist and be active
      //   2. Organisation must have clinician_selection_mode = 'internal_assign'
      //   3. The requested service must exist and be active for this org
      //   4. The user must have an active membership in this org (or be a platform admin)

      // Step 1: Verify org exists and is active
      const { data: org, error: orgError } = await serviceClient
        .from('organisations')
        .select('id, name, status')
        .eq('id', payload.organisationId)
        .maybeSingle();

      if (orgError || !org) {
        return new Response(JSON.stringify({
          error: 'Organisation not found',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (org.status !== 'active') {
        return new Response(JSON.stringify({
          error: 'Organisation is not active',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 2: Verify internal_assign mode
      const { data: modeConfig } = await serviceClient
        .from('organisation_config')
        .select('config_value')
        .eq('organisation_id', payload.organisationId)
        .eq('config_key', 'clinician_selection_mode')
        .maybeSingle();

      const selectionMode = modeConfig?.config_value || 'patient_select';
      if (selectionMode !== 'internal_assign') {
        return new Response(JSON.stringify({
          error: 'This organisation does not support service-type bookings. Please select a doctor.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 3: Verify the service exists and is active for this org
      const { data: serviceCheck } = await serviceClient
        .from('organisation_services')
        .select('id')
        .eq('organisation_id', payload.organisationId)
        .eq('name', payload.serviceType)
        .eq('active', true)
        .maybeSingle();

      if (!serviceCheck) {
        return new Response(JSON.stringify({
          error: 'Service type not found or inactive for this organisation',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 4: Verify user membership in this org (or platform admin)
      const { data: membership } = await serviceClient
        .from('organisation_members')
        .select('id, role')
        .eq('organisation_id', payload.organisationId)
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle();

      const { data: userRoles } = await serviceClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('active', true);

      const isPlatformAdmin = (userRoles || []).some(
        (r: { role: string }) => r.role === 'platform_superadmin',
      );

      if (!membership && !isPlatformAdmin) {
        return new Response(JSON.stringify({
          error: 'You are not a member of this organisation',
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      organisationId = payload.organisationId;
    } else if (isInternalAssignment) {
      // Internal assignment without explicit org: resolve from user's membership
      const { data: memberships } = await serviceClient
        .from('organisation_members')
        .select('organisation_id')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle();
      organisationId = memberships?.organisation_id || null;

      if (!organisationId) {
        return new Response(JSON.stringify({
          error: 'No organisation membership found. Please contact support.',
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Verify org booking mode allows this flow (for standard doctor flow)
    if (organisationId && isInternalAssignment && !payload.organisationId) {
      const { data: modeConfig } = await serviceClient
        .from('organisation_config')
        .select('config_value')
        .eq('organisation_id', organisationId)
        .eq('config_key', 'clinician_selection_mode')
        .maybeSingle();

      const selectionMode = modeConfig?.config_value || 'patient_select';
      if (selectionMode !== 'internal_assign') {
        return new Response(JSON.stringify({
          error: 'This organisation does not support service-type bookings. Please select a doctor.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const pricingService = new PricingService(serviceClient, organisationId);
    const availabilityService = new AvailabilityService(serviceClient, organisationId);
    const paymentService = new PaymentService(serviceClient);
    const walletService = new WalletService(serviceClient, organisationId);
    const promotionService = new PromotionService(serviceClient);
    const bookingService = new BookingService(
      serviceClient,
      pricingService,
      availabilityService,
      paymentService,
      walletService,
      promotionService,
      organisationId,
    );

    const result = await bookingService.initiateBooking({
      patientId: user.id,
      patientEmail,
      doctorId: payload.doctorId,
      serviceType: payload.serviceType,
      preferredDate: payload.preferredDate,
      preferredTime: payload.preferredTime,
      duration: payload.duration,
      consultationType: payload.consultationType,
      consultationLanguage: payload.consultationLanguage,
      paymentMethod: payload.paymentMethod,
      notes: payload.notes,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[booking-initiate] error', error);
    const errorMessage = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
