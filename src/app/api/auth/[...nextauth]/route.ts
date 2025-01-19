import NextAuth, { NextAuthOptions, Session } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { JWT } from "next-auth/jwt";
import { google } from 'googleapis';

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

async function refreshAccessToken(token: JWT) {
  try {
    console.log('Refreshing access token...');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL // Add the redirect URI
    );

    oauth2Client.setCredentials({
      refresh_token: token.refreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('Token refreshed successfully');

    return {
      ...token,
      accessToken: credentials.access_token,
      refreshToken: token.refreshToken,
      expiresAt: Math.floor((Date.now() + (credentials.expiry_date || 3600 * 1000)) / 1000),
      error: undefined,
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid https://www.googleapis.com/auth/gmail.readonly",
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        console.log('Initial sign in, setting tokens');
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }

      // If there was an error, try to refresh regardless of expiry
      if (token.error || !token.accessToken) {
        console.log('Token has error or is missing, attempting refresh');
        return refreshAccessToken(token);
      }

      // Return previous token if the access token has not expired
      if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
        console.log('Token still valid, expires at:', new Date(token.expiresAt * 1000));
        return token;
      }

      console.log('Token expired, attempting refresh');
      return refreshAccessToken(token);
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      console.log('Setting session from token:', {
        hasAccessToken: !!token.accessToken,
        hasError: !!token.error,
        expiresAt: token.expiresAt,
      });
      
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.expiresAt = token.expiresAt;
      session.error = token.error;
      return session;
    },
  },
  debug: true,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
