"use client";
import { Check, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/format";

export function SaveToVaultButton({ universeId, initiallyVaulted }: { universeId: number; initiallyVaulted: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(initiallyVaulted ? "done" : "idle");
  return (
    <button
      disabled={state === "busy" || state === "done"}
      onClick={async () => {
        setState("busy");
        try {
          await api.vaultById({ universeId, sourceUrl: typeof window !== "undefined" ? window.location.href : null });
          setState("done");
          router.refresh(); // game pages switch to showing "Your log"
        } catch {
          setState("error");
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition",
        state === "done" ? "bg-go/10 text-go ring-go/30" : state === "error" ? "bg-rose-500/10 text-rose-300 ring-rose-500/30" : "bg-ink-800 text-ink-100 ring-ink-700 hover:ring-ink-600",
      )}
    >
      {state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : state === "done" ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {state === "done" ? "In your vault" : state === "error" ? "Retry" : "Save to My Vault"}
    </button>
  );
}
