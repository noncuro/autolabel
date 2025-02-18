import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { initTRPC } from "@trpc/server";
import type { gmail_v1 } from "googleapis";
import { google } from "googleapis";
import { getServerSession } from "next-auth/next";
import { cache } from "react";
import superjson from "superjson";
import { ZodError } from "zod";

export type Context = {
  gmail: gmail_v1.Gmail | null;
  userEmail: string | null;
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
  
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    console.log("No valid access token available");
    return { gmail: null, userEmail: null };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL,
  );

  console.log("Setting OAuth2 credentials:", {
    hasAccessToken: !!session.accessToken,
    hasRefreshToken: !!session.refreshToken,
    expiryDate: session.expiresAt
      ? new Date(session.expiresAt * 1000).toISOString()
      : undefined,
    redirectUri: process.env.NEXTAUTH_URL,
  });

  oauth2Client.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expiry_date: session.expiresAt ? session.expiresAt * 1000 : undefined,
  });

  // Enable automatic token refresh
  oauth2Client.on("tokens", (tokens) => {
    console.log("New tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : undefined,
    });
  });

  try {
    // Test the credentials before creating the Gmail client
    await oauth2Client.getAccessToken();
    console.log("Successfully validated access token");
  } catch (error) {
    console.error("Error validating access token:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
    return { gmail: null, userEmail: null };
  }

  console.log("Session:", session)

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  return { 
    gmail,
    userEmail: session.user?.email ?? null 
  };
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

export const publicProcedure = t.procedure.use(timingMiddleware);
