import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);

const getArg = (name, fallback) => {
  const longForm = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(longForm));
  if (match) return match.slice(longForm.length);

  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) return args[index + 1];

  return fallback;
};

const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag('help') || hasFlag('h')) {
  console.log(`\nCreate a test patient using Supabase Admin API\n\nUsage:\n  node scripts/create-test-patient.mjs \\\n+    --phone "+2348106733459" \\\n+    --password "password123" \\\n+    --name "Test Patient" \\\n+    --email "testpatient@example.com"\n\nOptional overrides:\n  --gender male|female|other\n  --age 30\n  --city Lagos\n  --state Lagos\n  --country Nigeria\n  --marital-status single|married|divorced|widowed\n  --emergency-contact-name "Emergency Contact"\n  --emergency-contact-phone "+2348111111111"\n  --identification-type nin|student_id|passport|drivers_license|voters_card|hospital_id\n  --identification-number "12345678901"\n\nRequired env vars:\n  SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n`);
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const phone = getArg('phone', '');
const password = getArg('password', '');
const name = getArg('name', '');
const email = getArg('email', '');

if (!phone || !password || !name) {
  console.error('Missing required args. Use --phone, --password, and --name.');
  process.exit(1);
}

const gender = getArg('gender', 'male');
const age = Number.parseInt(getArg('age', '30'), 10);
const city = getArg('city', 'Lagos');
const state = getArg('state', 'Lagos');
const country = getArg('country', 'Nigeria');
const maritalStatus = getArg('marital-status', 'single');
const emergencyContactName = getArg('emergency-contact-name', 'Emergency Contact');
const emergencyContactPhone = getArg('emergency-contact-phone', '+2348111111111');
const identificationType = getArg('identification-type', 'nin');
const identificationNumber = getArg('identification-number', `${Date.now()}`.slice(-11));

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userData, error: userError } = await supabase.auth.admin.createUser({
  phone,
  password,
  phone_confirm: true,
  email: email || undefined,
  user_metadata: {
    full_name: name,
    role: 'patient',
    email: email || undefined,
  },
});

if (userError) {
  console.error('Failed to create auth user:', userError.message);
  process.exit(1);
}

const userId = userData.user?.id;
if (!userId) {
  console.error('No user id returned from admin.createUser.');
  process.exit(1);
}

const { error: registrationError } = await supabase
  .from('patient_registrations')
  .insert([
    {
      user_id: userId,
      full_name: name,
      gender,
      age,
      phone_number: phone,
      email: email || null,
      city,
      state,
      country,
      marital_status: maritalStatus,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      identification_type: identificationType,
      identification_number: identificationNumber,
    },
  ]);

if (registrationError) {
  console.error('Failed to insert patient registration:', registrationError.message);
  process.exit(1);
}

console.log('Test patient created successfully.');
console.log(`User ID: ${userId}`);
