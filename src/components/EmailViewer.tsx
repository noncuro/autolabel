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
      limit: 20,
    },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      retry: false,
    },
  );
  const utils = trpc.useUtils();

  const bulkCategorize = trpc.gmail.bulkCategorizeAndLabel.useMutation({
    onSuccess: (data) => {
      // Refresh the email list to show new labels
      // utils.gmail.getRecentEmails.invalidate();
      if (data.skippedCount > 0) {
        console.log(
          `Categorization complete!\nProcessed: ${data.results.length} emails\nSkipped: ${data.skippedCount} already processed emails`,
        );
      }
    },
  });

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

  const loadAndRunCategorization = async () => {
    if (!data) return;
    let page = 0;
    let cursor: string | undefined | null = null;
    while (cursor !== undefined) {
      // Load a page
      const d = await utils.gmail.getRecentEmails.fetchInfinite({
        limit: 20,
        cursor: cursor ?? undefined,
      });
      console.log(
        `Loaded 20 more. Total emails: ${d.pages.reduce((acc, page) => acc + page.items.length, 0)}`,
      );
      // Run categorization
      const emails = d.pages.flatMap((page) => page.items);
      console.log(`Categorizing ${emails.length} emails`);
      await bulkCategorize.mutateAsync({ emails });
      console.log(`Categorization complete for page ${page + 1}`);
      cursor = d.pages[d.pages.length - 1]?.nextCursor;
      console.log(`Cursor: ${cursor}`);
      page++;
    }
  };

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
          <button
            onClick={() =>
              bulkCategorize.mutate({
                emails: data?.pages.flatMap((page) => page.items),
              })
            }
            disabled={bulkCategorize.isPending || !data?.pages[0].items.length}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-purple-300 text-sm"
          >
            {bulkCategorize.isPending ? "Categorizing..." : "Categorize All"}
          </button>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetching}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-green-300 text-sm"
            >
              {isFetching ? "Loading..." : "Load 100 More"}
            </button>
          )}
          <button
            onClick={() => {
              loadAndRunCategorization();
            }}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300 text-sm"
          >
            Incremental
          </button>
        </div>
        <div className="text-sm text-gray-600">
          {data.pages.reduce((acc, page) => acc + page.items.length, 0)} emails
          loaded
        </div>
      </div>
      {data.pages
        .flatMap((page) => page.items)
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((email) => (
          <EmailCard key={email.id} email={email} />
        ))}

      <div ref={ref} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="animate-pulse text-muted">Loading more...</div>
        )}
      </div>
    </div>
  );
}
