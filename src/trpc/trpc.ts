import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { initTRPC } from '@trpc/server';
import type { gmail_v1 } from 'googleapis';
import { google } from 'googleapis';
import { getServerSession } from 'next-auth/next';
import { cache } from 'react';
import superjson from 'superjson';
import { ZodError } from 'zod';

export type Context = {
  gmail: gmail_v1.Gmail | null;
};


const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
  defaultMeta: {
    isPrivate: true,
  },
});


export const router = t.router;

export const createTRPCContext = cache(async () => {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    return { gmail: null };
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: session.accessToken as string,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return { gmail };

});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev && false) {
    // TODO make an env var
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});


export const publicProcedure = t.procedure
  .use(timingMiddleware);
