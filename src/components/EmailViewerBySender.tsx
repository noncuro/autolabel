"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/trpc/client";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { EmailGroup } from "./EmailGroup";

interface EmailGroup {
  sender: string;
  emails: Array<{
    id: string;
    subject: string;
    date: string;
    snippet: string;
  }>;
}

export default function EmailViewerBySender() {
  const { data: session } = useSession();
  const [expandedSenders, setExpandedSenders] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading: loading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = trpc.gmail.getIndividualEmails.useInfiniteQuery(
    {
      limit: 50,
    },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  // Add intersection observer
  const { ref, inView } = useInView();

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

  // Group emails by sender
  const emailsBySender = data.pages
    .flatMap((page) => page.items)
    .reduce<Array<{ sender: string; emails: Array<{ id: string; subject: string; date: string; snippet: string; }> }>>(
      (groups, email) => {
        const existingGroup = groups.find((g) => g.sender === email.from);
        if (existingGroup) {
          existingGroup.emails.push({
            id: email.id,
            subject: email.subject,
            date: email.date,
            snippet: email.snippet,
          });
        } else {
          groups.push({
            sender: email.from,
            emails: [
              {
                id: email.id,
                subject: email.subject,
                date: email.date,
                snippet: email.snippet,
              },
            ],
          });
        }
        return groups;
      },
      []
    )
    .sort((a, b) => b.emails.length - a.emails.length);

  const toggleSender = (sender: string) => {
    setExpandedSenders((prev) => {
      const next = new Set(prev);
      if (next.has(sender)) {
        next.delete(sender);
      } else {
        next.add(sender);
      }
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => refetch()}
          className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-300"
        >
          Refresh
        </button>
      </div>
      {emailsBySender.map((group) => (
        <EmailGroup
          key={group.sender}
          sender={group.sender}
          emails={group.emails}
          isExpanded={expandedSenders.has(group.sender)}
          onToggleExpand={() => toggleSender(group.sender)}
        />
      ))}
      
      {/* Add loading indicator and intersection observer target */}
      <div ref={ref} className="h-4 w-full">
        {isFetchingNextPage && (
          <div className="flex justify-center items-center py-4">
            <div className="animate-pulse text-muted">Loading more...</div>
          </div>
        )}
      </div>
    </div>
  );
} 