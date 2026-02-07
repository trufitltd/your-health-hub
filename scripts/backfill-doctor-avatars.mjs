import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PAGE_SIZE = 500;

async function fetchDoctorRegistrations(offset) {
  const { data, error } = await supabase
    .from('doctor_registrations')
    .select('user_id, profile_picture_url')
    .not('profile_picture_url', 'is', null)
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw error;
  return data || [];
}

async function updateDoctorAvatar(userId, avatarUrl) {
  const { error } = await supabase
    .from('doctors')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);

  if (error) throw error;
}

async function backfill() {
  console.log('Starting doctor avatar backfill...');
  let offset = 0;
  let total = 0;

  while (true) {
    const rows = await fetchDoctorRegistrations(offset);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.user_id || !row.profile_picture_url) continue;
      await updateDoctorAvatar(row.user_id, row.profile_picture_url);
      total += 1;
    }

    offset += PAGE_SIZE;
  }

  console.log(`Backfill complete. Updated ${total} doctor avatars.`);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
