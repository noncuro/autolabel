import { useState } from "react";
import { trpc } from "@/trpc/client";

interface Email {
  id: string;
  subject: string;
  date: string;
  snippet: string;
}

interface EmailGroupProps {
  sender: string;
  emails: Email[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function EmailGroup({ sender, emails, isExpanded, onToggleExpand }: EmailGroupProps) {
  const [isArchived, setIsArchived] = useState(false);
  const bulkArchive = trpc.gmail.bulkArchiveEmails.useMutation({
    onSuccess: () => {
      setIsArchived(true);
    },
  });

  const handleBulkArchive = async () => {
    await bulkArchive.mutate({ emailIds: emails.map((e) => e.id) });
  };

  if (isArchived) {
    return null; // Hide the group once archived
  }

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--card-background)]">
      <div className="p-4 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">{sender}</h2>
          <p className="text-sm text-muted">{emails.length} emails</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onToggleExpand}
            className="px-3 py-1 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={handleBulkArchive}
            disabled={bulkArchive.isPending}
            className="px-3 py-1 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300"
          >
            {bulkArchive.isPending ? "Archiving..." : "Archive All"}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-[var(--border)]">
          {emails.map((email) => (
            <div
              key={email.id}
              className="p-4 border-b last:border-b-0 border-[var(--border)]"
            >
              <h3 className="font-medium">{email.subject}</h3>
              <p className="text-sm text-muted mt-1">
                {new Date(email.date).toLocaleString()}
              </p>
              <p className="text-sm mt-2">{email.snippet}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 