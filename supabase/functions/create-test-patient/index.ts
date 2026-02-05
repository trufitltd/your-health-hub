import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  phone: string;
  password: string;
  name: string;
  accessToken?: string;
  email?: string | null;
  gender?: "male" | "female" | "other";
  age?: number;
  city?: string;
  state?: string;
  country?: string;
  maritalStatus?: "single" | "married" | "divorced" | "widowed";
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  identificationType?:
    | "nin"
    | "student_id"
    | "passport"
    | "drivers_license"
    | "voters_card"
    | "hospital_id";
  identificationNumber?: string;
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminEmails = Deno.env.get("ADMIN_EMAILS");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase environment variables" });
    }

    if (!adminEmails) {
      return jsonResponse(403, { error: "ADMIN_EMAILS not configured" });
    }

    const adminEmailSet = new Set(
      adminEmails
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );

    let payload: Payload;
    try {
      payload = (await req.json()) as Payload;
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const headerToken = req.headers.get("Authorization") ?? "";
    const tokenFromHeader = headerToken.startsWith("Bearer ")
      ? headerToken.slice(7)
      : headerToken;
    const tokenFromBody = payload.accessToken?.trim() ?? "";
    const authToken = tokenFromHeader || tokenFromBody;

    console.log("Auth header present:", Boolean(headerToken));
    console.log("Auth token from body present:", Boolean(tokenFromBody));

    const authedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await authedClient.auth.getUser(
      authToken || undefined,
    );
    if (authError) {
      console.error("Auth getUser error:", authError.message);
    }
    const authedUser = authData?.user;
    const authedEmail = (
      authedUser?.email ?? (authedUser?.user_metadata?.email as string | undefined)
    )?.toLowerCase();

    if (authError || !authedEmail) {
      return jsonResponse(401, {
        error: "Unauthorized",
        debug: {
          hasHeader: Boolean(headerToken),
          hasBodyToken: Boolean(tokenFromBody),
          headerPrefix: headerToken ? headerToken.slice(0, 12) : null,
          authError: authError?.message ?? null,
          authedUserId: authedUser?.id ?? null,
          authedUserEmail: authedUser?.email ?? null,
          authedUserMetaEmail: (authedUser?.user_metadata as Record<string, unknown> | null)
            ? ((authedUser?.user_metadata as Record<string, unknown>).email as string | null)
            : null,
        },
      });
    }

    if (!adminEmailSet.has(authedEmail)) {
      return jsonResponse(403, { error: "Forbidden" });
    }

    const phone = payload.phone?.trim();
    const password = payload.password?.trim();
    const name = payload.name?.trim();

    if (!phone || !password || !name) {
      return jsonResponse(400, { error: "phone, password, and name are required" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
      email: payload.email ?? undefined,
      email_confirm: Boolean(payload.email),
      user_metadata: {
        full_name: name,
        role: "patient",
        email: payload.email ?? undefined,
      },
    });

    if (userError) {
      return jsonResponse(400, { error: userError.message });
    }

    const userId = userData.user?.id;
    if (!userId) {
      return jsonResponse(500, { error: "Failed to create auth user" });
    }

    const identificationNumber =
      payload.identificationNumber ?? `${Date.now()}`.slice(-11);

    const { error: registrationError } = await adminClient
      .from("patient_registrations")
      .insert([
        {
          user_id: userId,
          full_name: name,
          gender: payload.gender ?? "male",
          age: payload.age ?? 30,
          phone_number: phone,
          email: payload.email ?? null,
          city: payload.city ?? "Lagos",
          state: payload.state ?? "Lagos",
          country: payload.country ?? "Nigeria",
          marital_status: payload.maritalStatus ?? "single",
          emergency_contact_name: payload.emergencyContactName ?? "Emergency Contact",
          emergency_contact_phone:
            payload.emergencyContactPhone ?? "+2348111111111",
          identification_type: payload.identificationType ?? "nin",
          identification_number: identificationNumber,
        },
      ]);

    if (registrationError) {
      return jsonResponse(400, { error: registrationError.message });
    }

    return jsonResponse(200, { success: true, userId });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
