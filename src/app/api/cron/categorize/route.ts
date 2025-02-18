import { NextResponse } from "next/server";
import { processBatchEmails } from "@/services/gmail";
import { getAllGmailCredentials } from "@/services/redis";

// Vercel cron job will call this endpoint every minute
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

export async function GET(req: Request) {
  try {
    // Verify the request is from Vercel cron
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if we're in debug mode
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "true";

    if (debug) {
      console.log("Running in debug mode - inspecting credentials");
      const allCredentials = await getAllGmailCredentials();
      return NextResponse.json({
        credentialsFound: allCredentials.length,
        credentials: allCredentials.map(({ email, credentials }) => ({
          email,
          hasAccessToken: !!credentials.accessToken,
          hasRefreshToken: !!credentials.refreshToken,
          expiresAt: credentials.expiresAt ? new Date(credentials.expiresAt * 1000).toISOString() : null,
          isExpired: credentials.expiresAt ? Date.now() > credentials.expiresAt * 1000 : null,
        })),
      });
    }

    const result = await processBatchEmails();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in cron job:", error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
    return new NextResponse(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
} 