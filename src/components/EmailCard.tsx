interface EmailCardProps {
  email: {
    id: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    labels: Array<{
      id: string;
      name: string;
    }>;
  };
}

export function EmailCard({ email }: EmailCardProps) {
  const formattedDate = new Date(email.date).toLocaleString();

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
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {email.snippet}
        </div>
      </div>
    </div>
  );
}
