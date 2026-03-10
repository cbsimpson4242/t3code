import { useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useStore } from "../store";

const BOT_COLORS = [
  { bg: "bg-violet-500", ring: "ring-violet-400", text: "text-violet-400" },
  { bg: "bg-blue-500", ring: "ring-blue-400", text: "text-blue-400" },
  { bg: "bg-emerald-500", ring: "ring-emerald-400", text: "text-emerald-400" },
  { bg: "bg-amber-500", ring: "ring-amber-400", text: "text-amber-400" },
  { bg: "bg-rose-500", ring: "ring-rose-400", text: "text-rose-400" },
  { bg: "bg-cyan-500", ring: "ring-cyan-400", text: "text-cyan-400" },
  { bg: "bg-orange-500", ring: "ring-orange-400", text: "text-orange-400" },
  { bg: "bg-pink-500", ring: "ring-pink-400", text: "text-pink-400" },
  { bg: "bg-teal-500", ring: "ring-teal-400", text: "text-teal-400" },
  { bg: "bg-indigo-500", ring: "ring-indigo-400", text: "text-indigo-400" },
] as const;

export default function VirtualOfficeBar() {
  const threads = useStore((store) => store.threads);
  const navigate = useNavigate();

  // Detect current thread from pathname (e.g. "/<threadId>")
  const pathname = useLocation({ select: (l) => l.pathname });
  const currentThreadId = pathname.startsWith("/") && pathname.length > 1
    ? pathname.slice(1).split("/")[0]
    : undefined;

  const handleClick = useCallback(
    (threadId: string) => {
      void navigate({ to: "/$threadId", params: { threadId } });
    },
    [navigate],
  );

  if (threads.length === 0) return null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/50 bg-background/80 backdrop-blur-sm px-3 overflow-x-auto scrollbar-none">
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest shrink-0 mr-1">
        Office
      </span>
      {threads.map((thread, i) => {
        const isActive =
          thread.session?.status === "running" ||
          thread.session?.orchestrationStatus === "running" ||
          thread.latestTurn?.state === "running";
        const isError =
          thread.session?.status === "error" || thread.latestTurn?.state === "error";
        const isCurrent = currentThreadId === thread.id;
        const color = BOT_COLORS[i % BOT_COLORS.length]!;

        return (
          <button
            key={thread.id}
            type="button"
            title={thread.title}
            onClick={() => handleClick(thread.id)}
            className={`group relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all shrink-0 ${
              isCurrent
                ? `bg-muted text-foreground`
                : `text-muted-foreground hover:bg-muted/60 hover:text-foreground`
            }`}
          >
            {/* Status dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              {isActive && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color.bg}`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isActive ? color.bg : isError ? "bg-red-500" : "bg-muted-foreground/30"
                }`}
              />
            </span>
            {/* Thread name */}
            <span className="max-w-[100px] truncate">
              {thread.title || "Untitled"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
