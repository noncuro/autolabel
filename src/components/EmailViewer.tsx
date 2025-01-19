'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/trpc/client';
import { EmailCard } from './EmailCard';

export default function EmailViewer() {
  const { data: session } = useSession();
  const { data: emails, isLoading: loading } = trpc.getRecentEmails.useQuery(undefined, {
    enabled: !!session
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  if (!emails?.length) {
    return (
      <div className="flex justify-center items-center min-h-[200px] text-muted">
        No emails found
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {emails.map((email, index) => (
        <EmailCard key={index} email={email} />
      ))}
    </div>
  );
}

