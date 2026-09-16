import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ClinicianAssignmentService } from '../_shared/services/ClinicianAssignmentService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Retry stuck pending_assignment appointments.
 *
 * This function can be called:
 * - By a cron job (e.g., every 5 minutes)
 * - By an admin manually
 * - By the frontend when it detects a stuck appointment
 *
 * It finds appointments stuck in pending_assignment with retry_count < max
 * and attempts to assign clinicians.
 *
 * Response includes counts of processed, succeeded, and failed appointments.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const assignmentService = new ClinicianAssignmentService(supabase);
    const result = await assignmentService.processStuckAppointments();

    console.log('[retry-assignments] Completed', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[retry-assignments] error', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
