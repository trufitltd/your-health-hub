import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ClinicianAssignmentService } from '../_shared/services/ClinicianAssignmentService.ts';

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

    // Verify user
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
    const { appointmentId, doctorId } = payload;

    if (!appointmentId) {
      return new Response(JSON.stringify({ error: 'Missing appointmentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assignmentService = new ClinicianAssignmentService(serviceClient);

    let result;
    if (doctorId) {
      // Admin override: assign specific clinician
      result = await assignmentService.assignSpecificClinician(appointmentId, doctorId);
    } else {
      // Automatic assignment: round-robin
      result = await assignmentService.assignClinician(appointmentId);
    }

    if (!result.success) {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[assign-clinician] error', error);
    const errorMessage = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
