"use client";

import { useState } from "react";
import EmailViewer from "./EmailViewer";
import EmailViewerBySender from "./EmailViewerBySender";

export default function EmailViewerTabs() {
  const [activeTab, setActiveTab] = useState<"list" | "by-sender">("list");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-center border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 -mb-px ${
            activeTab === "list"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-muted"
          }`}
        >
          List View
        </button>
        <button
          onClick={() => setActiveTab("by-sender")}
          className={`px-4 py-2 -mb-px ${
            activeTab === "by-sender"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-muted"
          }`}
        >
          By Sender
        </button>
      </div>
      {activeTab === "list" ? <EmailViewer /> : <EmailViewerBySender />}
    </div>
  );
} 