'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/trpc/client';

export default function EmailViewer() {
  const { data: session } = useSession();
  const { data: email, isLoading: loading } = trpc.getRecentEmail.useQuery(undefined, {
    enabled: !!session
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex justify-center items-center min-h-[200px] text-muted">
        No email found
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-[var(--card-background)] shadow-sm border border-[var(--border)] rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{email.subject}</h1>
          <p className="text-[var(--muted)] text-sm">From: {email.from}</p>
        </div>
        
        <div className="border-t border-[var(--border)] pt-4">
          <div 
            className="prose prose-sm dark:prose-invert max-w-none" 
          >
            Snippet: {email.snippet}
          </div>
        </div>
      </div>
    </div>
  );
}

