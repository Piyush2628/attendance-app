"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteAdvance } from "@/app/admin/khata/actions";
import { Button } from "@/components/ui/button";

export function DeleteAdvanceButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={`Delete ${label}`}
      onClick={() => {
        if (!confirm(`Delete ${label}?`)) return;
        startTransition(async () => {
          await deleteAdvance(id);
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
