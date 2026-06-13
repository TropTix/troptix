// The Prisma client moved into @troptix/db (the packages/db relocation).
// This thin re-export keeps existing `import prisma from '@/server/prisma'`
// call sites working without churn.
export { default } from '@troptix/db';
