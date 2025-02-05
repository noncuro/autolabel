import { useState } from 'react';
import { trpc } from '@/trpc/client';

interface EmailCardProps {
  email: {
    id: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    bodyText: string;
    labels: Array<{
      id: string;
      name: string;
    }>;
  };
}

export function EmailCard({ email }: EmailCardProps) {
  const formattedDate = new Date(email.date).toLocaleString();
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldCategorize, setShouldCategorize] = useState(false);
  const {mutate: markAsArchived, isPending, isSuccess} = trpc.gmail.markAsArchived.useMutation(undefined);
  const { data: categories, isLoading, error } = trpc.gmail.categorizeEmail.useQuery(
    { email },
    { 
      enabled: shouldCategorize,
      retry: false, // Don't retry on error
    }
  );

  const displayText = isExpanded
    ? email.bodyText
    : email.bodyText.length > 1000
    ? email.bodyText.slice(0, 1000) + "..."
    : email.bodyText;

  return (
    <div className="bg-[var(--card-background)] shadow-sm border border-[var(--border)] rounded-xl p-6 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <h1 className="text-xl font-semibold tracking-tight">
            {email.subject}
          </h1>
          <div className="flex flex-wrap gap-1">
            {email.labels.map((label) => (
              <span
                key={label.id}
                className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground"
              >
                {label.name}
              </span>
            ))}
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>From: {email.from}</div>
          <div>To: {email.to}</div>
          <div>Date: {formattedDate}</div>
          <div>Length: {email.bodyText.length}</div>
          <button
            onClick={() => setShouldCategorize(true)}
            disabled={isLoading || shouldCategorize}
            className="mt-2 px-3 py-1 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Categorizing...
              </span>
            ) : 'Categorize Email'}
          </button>

          <button 
            className="mt-2 px-3 py-1 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 ml-2"
            onClick={() => markAsArchived({emailId: email.id})} disabled={isPending || isSuccess}>
            {isPending ? 'Marking as Archived...' : isSuccess ? 'Archived' : 'Mark as Archived'}
          </button>
          {error && (
            <div className="mt-2 p-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
              Error: {error.message || 'Failed to categorize email'}
            </div>
          )}

          {categories && (
            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md">
              <p className="font-medium">Categories:</p>
              <ul className="list-disc list-inside mt-1">
                {categories.is_cold_inbound && (
                  <CategoryLabelButton
                    emailId={email.id}
                    labelName="Cold Inbound"
                  />
                )}
                {categories.is_recruiting && (
                  <CategoryLabelButton
                    emailId={email.id}
                    labelName="Recruiting"
                  />
                )}
                {categories.is_internal && (
                  <CategoryLabelButton
                    emailId={email.id}
                    labelName="Internal"
                  />
                )}
                {categories.is_updates && (
                  <CategoryLabelButton
                    emailId={email.id}
                    labelName="Updates"
                  />
                )}
                {categories.is_promotional && (
                  <CategoryLabelButton
                    emailId={email.id}
                    labelName="Promotional"
                  />
                )}
              </ul>
              {/* <p className="mt-2"><span className="font-medium">Explanation:</span> {categories.explanation}</p> */}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {displayText}
        </div>
        {email.bodyText.length > 1000 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

export function CategoryLabelButton({ emailId, labelName }: {
  emailId: string;
  labelName: string;
}) {
  const utils = trpc.useUtils();
  const addLabelMutation = trpc.gmail.addLabel.useMutation({
    onSettled: () => {
      utils.gmail.getRecentEmails.invalidate();
    },
  });

  const handleClick = async () => {
    try {
      await addLabelMutation.mutate({
        emailId,
        labelName,
      });
    } catch (error) {
      alert('Failed to add label: see console for details');
      console.error('Failed to add label:', error);
    }
  };

  return (
    <li>
      <button
        onClick={handleClick}
        className="hover:text-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={addLabelMutation.isPending}
      >
        {labelName}
      </button>
    </li>
  );
}

