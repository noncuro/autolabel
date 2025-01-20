'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/trpc/client';
import { EmailCard } from './EmailCard';
import { useInView } from 'react-intersection-observer';
import { useEffect } from 'react';

export default function EmailViewer() {
  const { data: session } = useSession();
  const { ref, inView } = useInView();

  const {
    data,
    isLoading: loading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = trpc.getRecentEmails.useInfiniteQuery(
    {
      limit: 10,
    },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      retry: false,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  if (!data?.pages[0].items.length) {
    return (
      <div className="flex justify-center items-center min-h-[200px] text-muted">
        No emails found
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {data.pages.map((page) =>
        page.items.map((email, index) => (
          <EmailCard key={email.id} email={email} />
        ))
      )}
      
      <div ref={ref} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="animate-pulse text-muted">Loading more...</div>
        )}
      </div>
    </div>
  );
}

