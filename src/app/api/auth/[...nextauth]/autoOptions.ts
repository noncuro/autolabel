import { NextAuthOptions, Session } from "next-auth";
import { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
    providers: [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorization: {
          params: {
            scope: "openid email profile https://www.googleapis.com/auth/gmail.modify",
            prompt: "consent",
            access_type: "offline",
            response_type: "code",
          },
        },
      }),
    ],
    callbacks: {
      async jwt({ token, account }): Promise<JWT> {
        if (account) {
          console.log("Initial sign in, setting tokens");
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
          console.log("Token has error or is missing, attempting refresh");
          return refreshAccessToken(token);
        }
  
        // Return previous token if the access token has not expired
        if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
          console.log(
            "Token still valid, expires at:",
            new Date(token.expiresAt * 1000),
          );
          return token;
        }
  
        console.log("Token expired, attempting refresh");
        return refreshAccessToken(token);
      },
      async session({ session, token }: { session: Session; token: JWT }) {
        console.log("Setting session from token:", {
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