import type { AppRouter } from '@g4os/ipc/server';
import type { CreateTRPCReact } from '@trpc/react-query';
import { createTRPCReact } from '@trpc/react-query';

export const trpcReact: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
