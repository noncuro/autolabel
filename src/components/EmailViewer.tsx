"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/trpc/client";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { EmailCard } from "./EmailCard";

export default function EmailViewer() {
  const { data: session } = useSession();
  const { ref, inView } = useInView();

  const {
    data,
    isLoading: loading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetching,
  } = trpc.gmail.getRecentEmails.useInfiniteQuery(
    {
      limit: 3,
    },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      retry: false,
    },
  );

  const handleLoadMore = async () => {
    if (!hasNextPage || isFetching) return;
    // Load 10 pages (100 emails) or until we run out of pages
    for (let i = 0; i < 10; i++) {
      const result = await fetchNextPage();
      if (!result.data?.pages[result.data.pages.length - 1].nextCursor) {
        break;
      }
    }
  };

  const handleDownload = () => {
    if (!data) return;
    const allEmails = data.pages.flatMap((page) => page.items);
    const blob = new Blob([JSON.stringify(allEmails, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emails.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
      <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            Download Emails
          </button>
          {hasNextPage && (
            <button
              onClick={handleLoadMore}
              disabled={isFetching}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-green-300 text-sm"
            >
              {isFetching ? "Loading..." : "Load 100 More"}
            </button>
          )}
        </div>
        <div className="text-sm text-gray-600">
          {data.pages.reduce((acc, page) => acc + page.items.length, 0)} emails
          loaded
        </div>
      </div>
      {data.pages.map((page) =>
        page.items.map((email) => <EmailCard key={email.id} email={email} />),
      )}

      <div ref={ref} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="animate-pulse text-muted">Loading more...</div>
        )}
      </div>
    </div>
  );
}
