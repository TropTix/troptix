/**
 * Read-only audit: every Events.imageUrl resolves to a reachable object (HTTP
 * 200/206). Run after the storage migration and before decommissioning Firebase.
 *
 * Usage (from apps/web):
 *   yarn check:images
 *
 * Point .env at the environment to audit — the DB and NEXT_PUBLIC_SUPABASE_URL
 * must be the SAME Supabase project. Required env:
 *   POSTGRES_URL_NON_POOLING (preferred) or POSTGRES_PRISMA_URL,
 *   NEXT_PUBLIC_SUPABASE_URL
 */
if (process.env.POSTGRES_URL_NON_POOLING) {
  process.env.POSTGRES_PRISMA_URL = process.env.POSTGRES_URL_NON_POOLING;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BUCKET = 'event-flyers';
const CONCURRENCY = 10;

if (!SUPABASE_URL) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL is required.');
  process.exit(1);
}

const resolveUrl = (value: string): string => {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${value.replace(/^\/+/, '')}`;
};

async function check(url: string): Promise<number | string> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return res.ok ? 200 : res.status;
  } catch (e) {
    return e instanceof Error ? e.message : 'fetch error';
  }
}

async function main() {
  const { default: prisma } = await import('@troptix/db');
  try {
    const rows = (
      await prisma.events.findMany({
        where: { imageUrl: { not: null } },
        select: { id: true, name: true, imageUrl: true },
      })
    ).filter((r) => r.imageUrl && r.imageUrl.trim());

    console.log(
      `Checking ${rows.length} event image(s) against ${SUPABASE_URL}\n`
    );

    const broken: {
      id: string;
      name: string | null;
      url: string;
      status: number | string;
    }[] = [];
    let ok = 0;

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(
        rows.slice(i, i + CONCURRENCY).map(async (row) => {
          const url = resolveUrl(row.imageUrl!);
          const status = await check(url);
          if (status === 200) ok++;
          else broken.push({ id: row.id, name: row.name, url, status });
        })
      );
    }

    console.log(`✓ ${ok} OK`);
    if (broken.length) {
      console.log(`\n✗ ${broken.length} BROKEN:`);
      for (const b of broken) {
        const legacy = /firebasestorage\.googleapis\.com/.test(b.url)
          ? ' [still Firebase]'
          : '';
        console.log(`  ${b.status}  ${b.id}  ${b.name ?? ''}${legacy}`);
        console.log(`        ${b.url}`);
      }
      process.exitCode = 1;
    } else {
      console.log('\nAll event images resolve. ✅');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
