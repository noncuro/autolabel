'use client';

import { TRPCProvider } from "@/trpc/client";
import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <TRPCProvider><SessionProvider>{children}</SessionProvider></TRPCProvider>;
} 