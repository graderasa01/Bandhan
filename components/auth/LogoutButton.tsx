"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * A standalone logout control, for the screens that sit *outside* a shell.
 *
 * `UserShell` / `PartnerShell` / `AdminShell` each carry their own logout in
 * the sidebar, so any page inside one is covered. The pages that are not —
 * `/partner/pending` being the one that bit us — had no way out at all: a
 * partner waiting on approval is logged in, has no dashboard to enter, and
 * "Go to Home" keeps the same session, so they cannot sign in as a member
 * either. This is the way out.
 */
export default function LogoutButton({
  next = "/login",
  label = "Logout",
}: {
  next?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="md" onClick={logout} loading={busy} icon={<LogOut className="size-4" />}>
      {label}
    </Button>
  );
}
