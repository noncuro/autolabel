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





const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
