"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FlowInfo {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
}

interface FlowPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onTriggered?: (runId: string) => void;
}

export function FlowPicker({
  open,
  onOpenChange,
  contactId,
  onTriggered,
}: FlowPickerProps) {
  const [flows, setFlows] = useState<FlowInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/flows");
        if (!res.ok) throw new Error("Failed to load flows");
        const data = await res.json();
        const activeFlows = (data.flows ?? []).filter(
          (f: FlowInfo) => f.status === "active"
        );
        if (!cancelled) setFlows(activeFlows);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load active flows.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleStartFlow(flowId: string) {
    setTriggeringId(flowId);
    try {
      const res = await fetch(`/api/flows/${flowId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to start flow");
      }

      const json = await res.json();
      toast.success("Flow triggered successfully!");
      onOpenChange(false);
      if (onTriggered && json.runId) {
        onTriggered(json.runId);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to start flow");
    } finally {
      setTriggeringId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle>Trigger a flow</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Send an interactive WhatsApp flow manually to this contact.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : flows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No active flows found. Please activate a flow in settings first.
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
            {flows.map((flow) => {
              const isTriggering = triggeringId === flow.id;
              return (
                <div
                  key={flow.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {flow.name}
                    </p>
                    {flow.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {flow.description}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={triggeringId !== null}
                    onClick={() => handleStartFlow(flow.id)}
                    className="shrink-0 gap-1"
                  >
                    {isTriggering ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-foreground animate-none" />
                    )}
                    Start
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
