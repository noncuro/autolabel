import { google } from "googleapis";
import NextAuth from "next-auth";
import { JWT } from "next-auth/jwt";
import { authOptions } from "./autoOptions";
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    console.log("Refreshing access token...");
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL, // Add the redirect URI
    );

    oauth2Client.setCredentials({
      refresh_token: token.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("Token refreshed successfully");

    return {
      ...token,
      accessToken: credentials.access_token ?? undefined,
      refreshToken: token.refreshToken,
      expiresAt: Math.floor(
        (Date.now() + (credentials.expiry_date || 3600 * 1000)) / 1000,
      ),
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}



const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
