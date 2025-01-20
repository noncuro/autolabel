"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/trpc/client";
import { EmailCard } from "./EmailCard";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";

export default function EmailViewer() {
  const { data: session } = useSession();
  const { ref, inView } = useInView();

  const {
    data,
    isLoading: loading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.getRecentEmails.useInfiniteQuery(
    {
      limit: 10,
    },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      retry: false,
    },
  );

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
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          Download Emails
        </button>
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
