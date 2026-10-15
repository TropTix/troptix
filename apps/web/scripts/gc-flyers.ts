/**
 * Deletes event-flyers objects that no Events row points at. The form never
 * deletes from storage (issue #342); this sweep does, and only for objects older
 * than a day so an upload still waiting on Save survives.
 *
 *   pnpm --filter web gc:flyers            dry run
 *   pnpm --filter web gc:flyers --commit   delete
 */
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@troptix/db';
import { EVENT_FLYERS_BUCKET } from '@/lib/supabase/storage';

const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;
const commit = process.argv.includes('--commit');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.'
  );
  process.exit(1);
}

const bucket = createClient(url, key, {
  auth: { persistSession: false },
}).storage.from(EVENT_FLYERS_BUCKET);

type StorageObject = NonNullable<
  Awaited<ReturnType<typeof bucket.list>>['data']
>[number];

async function listObjects() {
  const objects: StorageObject[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list('', { limit: PAGE, offset });
    if (error) throw error;
    objects.push(...data.filter((o) => o.id !== null));
    if (data.length < PAGE) return objects;
  }
}

async function referencedPaths() {
  const rows = await prisma.events.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  const paths = new Set<string>();
  for (const { imageUrl } of rows) {
    if (!imageUrl) continue;
    paths.add(
      imageUrl
        .replace(new RegExp(`^.*/${EVENT_FLYERS_BUCKET}/`), '')
        .replace(/^\/+/, '')
    );
  }
  return paths;
}

async function main() {
  const [objects, referenced] = await Promise.all([
    listObjects(),
    referencedPaths(),
  ]);
  const cutoff = Date.now() - MIN_AGE_MS;
  const orphans = objects.filter(
    (o) => !referenced.has(o.name) && Date.parse(o.created_at ?? '') < cutoff
  );

  console.log(
    `${objects.length} objects in ${EVENT_FLYERS_BUCKET}, ${referenced.size} referenced, ${orphans.length} unreferenced and older than 24h`
  );
  for (const o of orphans) {
    console.log(
      `${commit ? 'deleting' : 'would delete'} ${o.name} (${o.created_at})`
    );
  }

  if (!commit) {
    console.log('Dry run. Pass --commit to delete.');
    return;
  }
  if (orphans.length === 0) return;
  const { error } = await bucket.remove(orphans.map((o) => o.name));
  if (error) throw error;
  console.log(`Deleted ${orphans.length} objects.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
