import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@troptix/api';

export const trpc = createTRPCReact<AppRouter>();
