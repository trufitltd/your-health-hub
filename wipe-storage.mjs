import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listAllPaths(bucket, prefix = '') {
  const allPaths = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        // Folder placeholder; recurse into it.
        const nested = await listAllPaths(bucket, fullPath);
        allPaths.push(...nested);
      } else {
        allPaths.push(fullPath);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return allPaths;
}

async function removeInChunks(bucket, paths, chunkSize = 100) {
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) throw error;
  }
}

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;

  for (const bucket of buckets || []) {
    const bucketName = bucket.name;
    const paths = await listAllPaths(bucketName);
    if (paths.length === 0) {
      console.log(`[${bucketName}] empty`);
      continue;
    }

    await removeInChunks(bucketName, paths, 100);
    console.log(`[${bucketName}] deleted ${paths.length} object(s)`);
  }

  console.log('Storage wipe complete.');
}

main().catch((err) => {
  console.error('Storage wipe failed:', err?.message || err);
  process.exit(1);
});
