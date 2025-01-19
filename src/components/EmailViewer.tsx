'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function EmailViewer() {
  const { data: session } = useSession();
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const response = await fetch('/api/emails/recent');
        if (!response.ok) throw new Error('Failed to fetch email');
        const data = await response.json();
        setEmail(data);
      } catch (error) {
        console.error('Error fetching email:', error);
      } finally {
        setLoading(false);
      }
    };

    if (session) {
      fetchEmail();
    }
  }, [session]);

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
            dangerouslySetInnerHTML={{ __html: email.body }} 
          />
        </div>
      </div>
    </div>
  );
}
