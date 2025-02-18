"use client";

import { signOut } from "next-auth/react";

export default function NavBar() {
  return (
    <nav className="flex justify-end p-4 border-b border-[var(--border)]">
      <button
        onClick={() => signOut()}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Sign Out
      </button>
    </nav>
  );
}
