"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import type { AdminAccountRow } from "@/lib/services/admin/adminAccountService";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin — full access" },
  { value: "SUPPORT", label: "Support — limited access" },
];

export default function AdminAccountsManager({
  rows,
  currentUserId,
}: {
  rows: AdminAccountRow[];
  currentUserId: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <NewAdminForm onCreated={() => router.refresh()} />

      <div className="space-y-3">
        {rows.map((row) => (
          <Card key={row.id} padding="md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-medium text-ink">
                  {row.fullName}
                  {row.id === currentUserId && (
                    <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                      Aap
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted">{row.email}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-bg-subtle px-2.5 py-1 text-[0.75rem] font-medium text-ink">
                <ShieldCheck className="size-3.5" />
                {row.role}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-subtle">
              <span>Joined {row.createdAt}</span>
              <span>{row.lastLoginAt ? `Last login ${row.lastLoginAt}` : "Kabhi login nahi kiya"}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NewAdminForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SUPPORT">("SUPPORT");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (fullName.trim().length < 2) {
      toast({ title: "Naam chhota hai", description: "Kam se kam 2 characters likhiye.", tone: "error" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password chhota hai", description: "Kam se kam 8 characters ka ho.", tone: "error" });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password, role }),
      });
      const json = await res.json().catch(() => ({ message: "Server ne kuch nahi bola." }));
      if (!res.ok) {
        toast({ title: "Account nahi bana", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Account ban gaya", description: `${fullName.trim()} ab ${role} ke roop me login kar sakte hain.`, tone: "success" });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("SUPPORT");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="md">
      <h2 className="mb-3 text-lg font-semibold text-wine-700">Naya account banayein</h2>
      <div className="space-y-3">
        <Input label="Naam" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Poora naam" />
        <Input
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="naam@bandhantak.com"
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Kam se kam 8 characters"
        />
        <div>
          <label className="mb-1 block text-[0.8125rem] font-medium text-ink">Role</label>
          <Select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "SUPPORT")} options={ROLE_OPTIONS} />
        </div>

        <Button variant="primary" size="md" disabled={busy} onClick={submit}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Create Account
        </Button>
      </div>
    </Card>
  );
}
