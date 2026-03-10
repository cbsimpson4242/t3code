import { useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useStore } from "../store";

const BOT_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
] as const;

export default function VirtualOfficeBar() {
  const threads = useStore((store) => store.threads);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });

  // Current thread from pathname e.g. "/<threadId>"
  const currentThreadId =
    pathname.length > 1 ? pathname.slice(1).split("/")[0] : undefined;

  const handleClick = useCallback(
    (threadId: string) => {
      void navigate({ to: "/$threadId", params: { threadId } });
    },
    [navigate],
  );

  if (threads.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/50 bg-background/80 backdrop-blur-sm px-3 overflow-x-auto scrollbar-none">
      <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-widest shrink-0 pr-2 border-r border-border/40 mr-1">
        Office
      </span>
      {threads.map((thread, i) => {
        const isActive =
          thread.session?.status === "running" ||
          thread.session?.orchestrationStatus === "running" ||
          thread.latestTurn?.state === "running";
        const isError =
          thread.session?.status === "error" ||
          thread.latestTurn?.state === "error";
        const isCurrent = currentThreadId === thread.id;
        const color = BOT_COLORS[i % BOT_COLORS.length]!;

        return (
          <button
            key={thread.id}
            type="button"
            title={thread.title}
            onClick={() => handleClick(thread.id)}
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-all shrink-0 ${
              isCurrent
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {/* Status dot */}
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              {isActive && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  isActive ? color : isError ? "bg-red-500" : "bg-muted-foreground/25"
                }`}
              />
            </span>
            <span className="max-w-[96px] truncate">
              {thread.title || "Untitled"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
