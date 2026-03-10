import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { BotIcon, MonitorIcon, CoffeeIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useStore } from "../store";

// Office Configuration
const ROOM_WIDTH = 1600;
const ROOM_HEIGHT = 600;

// Bot color palette
const BOT_COLORS = [
  { text: "text-violet-500", bg: "bg-violet-500", ring: "ring-violet-400/60", border: "border-violet-400" },
  { text: "text-blue-500", bg: "bg-blue-500", ring: "ring-blue-400/60", border: "border-blue-400" },
  { text: "text-emerald-500", bg: "bg-emerald-500", ring: "ring-emerald-400/60", border: "border-emerald-400" },
  { text: "text-amber-500", bg: "bg-amber-500", ring: "ring-amber-400/60", border: "border-amber-400" },
  { text: "text-rose-500", bg: "bg-rose-500", ring: "ring-rose-400/60", border: "border-rose-400" },
  { text: "text-cyan-500", bg: "bg-cyan-500", ring: "ring-cyan-400/60", border: "border-cyan-400" },
  { text: "text-orange-500", bg: "bg-orange-500", ring: "ring-orange-400/60", border: "border-orange-400" },
  { text: "text-pink-500", bg: "bg-pink-500", ring: "ring-pink-400/60", border: "border-pink-400" },
  { text: "text-teal-500", bg: "bg-teal-500", ring: "ring-teal-400/60", border: "border-teal-400" },
  { text: "text-indigo-500", bg: "bg-indigo-500", ring: "ring-indigo-400/60", border: "border-indigo-400" },
] as const;

// Idle thought emojis
const THOUGHT_EMOJIS = ["\u2615", "\ud83d\udca4", "\ud83d\udca1", "\ud83c\udf3f", "\ud83c\udfb5", "\ud83d\ude80", "\ud83d\udcda", "\u2728"];

// POIs (Points of Interest) for idle bots
const POIS = [
  { x: 180, y: 310 },
  { x: 120, y: 500 },
  { x: 1480, y: 500 },
  { x: 800, y: 450 },
  { x: 900, y: 395 },
  { x: 700, y: 395 },
  { x: 1360, y: 110 },
  { x: 800, y: 290 },
  { x: 340, y: 450 },
];

function getRandomPOI() {
  return POIS[Math.floor(Math.random() * POIS.length)]!;
}

function getDeskLocation(index: number) {
  const desksPerRow = 5;
  const row = Math.floor(index / desksPerRow);
  const col = index % desksPerRow;
  return { x: 320 + col * 250, y: 105 + row * 155 };
}

function jitter(num: number, amount = 15) {
  return num + (Math.random() * amount * 2 - amount);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Conference table chair positions (around the oval)
const TABLE_CHAIRS = [
  { x: 700, y: 380 }, { x: 740, y: 365 }, { x: 860, y: 365 },
  { x: 900, y: 380 }, { x: 900, y: 420 }, { x: 860, y: 435 },
  { x: 740, y: 435 }, { x: 700, y: 420 },
];

interface BotState {
  x: number;
  y: number;
  nextMoveTime: number;
  transitionMs: number;
  facingLeft: boolean;
  thoughtEmoji: string | null;
}

export default function VirtualOffice() {
  const threads = useStore((store) => store.threads);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [hoveredBotId, setHoveredBotId] = useState<string | null>(null);

  // Responsive scaling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const s = Math.min(width / ROOM_WIDTH, height / ROOM_HEIGHT, 1.5);
      setScale(Math.max(0.3, s));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const bots = useMemo(() => {
    return threads.map((thread, i) => {
      const isActive =
        thread.session?.status === "running" ||
        thread.session?.orchestrationStatus === "running" ||
        thread.latestTurn?.state === "running";
      const isError = thread.session?.status === "error" || thread.latestTurn?.state === "error";
      const color = BOT_COLORS[i % BOT_COLORS.length]!;

      return {
        id: thread.id,
        title: thread.title,
        model: thread.model,
        status: thread.session?.orchestrationStatus ?? (thread.session?.status ?? "disconnected"),
        deskLocation: getDeskLocation(i),
        isActive,
        isError,
        color,
      };
    });
  }, [threads]);

  // Per-bot position state with individual timing
  const [botStates, setBotStates] = useState<Record<string, BotState>>({});

  // Initialize new bots
  useEffect(() => {
    setBotStates((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const bot of bots) {
        if (!next[bot.id]) {
          next[bot.id] = {
            x: bot.deskLocation.x,
            y: bot.deskLocation.y,
            nextMoveTime: Date.now() + 1000 + Math.random() * 2000,
            transitionMs: 2000,
            facingLeft: false,
            thoughtEmoji: null,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [bots]);

  // Movement loop - checks every 500ms, moves bots individually
  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();

      setBotStates((prev) => {
        const next = { ...prev };
        let changed = false;

        for (const bot of bots) {
          const state = prev[bot.id];
          if (!state || now < state.nextMoveTime) continue;

          if (bot.isActive) {
            // Active: go to desk, subtle jiggle
            const atDesk = Math.abs(state.x - bot.deskLocation.x) < 5 && Math.abs(state.y - bot.deskLocation.y) < 5;
            if (!atDesk) {
              const dist = distance(state, bot.deskLocation);
              next[bot.id] = {
                ...state,
                x: bot.deskLocation.x,
                y: bot.deskLocation.y,
                transitionMs: Math.max(800, dist * 4),
                nextMoveTime: now + Math.max(1000, dist * 4) + 500,
                facingLeft: bot.deskLocation.x < state.x,
                thoughtEmoji: null,
              };
            } else {
              // Tiny jiggle at desk
              next[bot.id] = {
                ...state,
                x: bot.deskLocation.x + (Math.random() > 0.5 ? -1.5 : 1.5),
                y: bot.deskLocation.y,
                transitionMs: 400,
                nextMoveTime: now + 1500 + Math.random() * 1000,
                thoughtEmoji: null,
              };
            }
            changed = true;
          } else {
            // Idle: 30% chance to stay put
            if (Math.random() < 0.3) {
              next[bot.id] = {
                ...state,
                nextMoveTime: now + 2000 + Math.random() * 2000,
                thoughtEmoji: Math.random() < 0.25
                  ? THOUGHT_EMOJIS[Math.floor(Math.random() * THOUGHT_EMOJIS.length)]!
                  : null,
              };
              changed = true;
            } else {
              const target = getRandomPOI();
              const dest = { x: jitter(target.x, 25), y: jitter(target.y, 25) };
              const dist = distance(state, dest);
              const ms = Math.max(1500, dist * 5);
              next[bot.id] = {
                ...state,
                x: dest.x,
                y: dest.y,
                transitionMs: ms,
                nextMoveTime: now + ms + 500 + Math.random() * 2000,
                facingLeft: dest.x < state.x,
                thoughtEmoji: Math.random() < 0.15
                  ? THOUGHT_EMOJIS[Math.floor(Math.random() * THOUGHT_EMOJIS.length)]!
                  : null,
              };
              changed = true;
            }
          }
        }

        return changed ? next : prev;
      });
    }, 500);

    return () => clearInterval(intervalId);
  }, [bots]);

  const handleBotClick = useCallback(
    (threadId: string) => {
      void navigate({ to: "/$threadId", params: { threadId } });
    },
    [navigate],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-background overflow-hidden"
    >
        <div
          className="relative rounded-lg border border-border/50 bg-secondary/20 overflow-hidden shadow-2xl"
          style={{
            width: ROOM_WIDTH,
            height: ROOM_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
        {/* Floor - wood plank pattern */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 78px,
                var(--color-border) 78px,
                var(--color-border) 80px
              ),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 38px,
                var(--color-border) 38px,
                var(--color-border) 40px
              )
            `,
          }}
        />

        {/* Wall edges */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-muted-foreground/20" />
        <div className="absolute top-0 left-0 w-1.5 h-full bg-muted-foreground/20" />

        {/* Rug under conference table */}
          <div
            className="absolute pointer-events-none"
            style={{ left: 650, top: 355, width: 300, height: 100 }}
          >
          <div className="w-full h-full bg-amber-800/10 rounded-[50%] border border-amber-700/10" />
        </div>

        {/* --- ENVIRONMENTAL PROPS --- */}

        {/* Desks with chairs */}
        {bots.map((bot) => (
          <div
            key={`desk-${bot.id}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: bot.deskLocation.x, top: bot.deskLocation.y - 18 }}
          >
            <div className="mb-1 max-w-24 truncate rounded border border-border/60 bg-background/90 px-1.5 py-0.5 text-center text-[9px] font-mono text-foreground/80 shadow-sm">
              {bot.title.slice(0, 18)}
              {bot.title.length > 18 ? "..." : ""}
            </div>
            {/* Monitor on stand */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-7 bg-slate-700/60 rounded-sm border border-slate-600/50 flex items-center justify-center">
                <MonitorIcon className="size-4 text-blue-400/70" />
              </div>
              <div className="w-1 h-1.5 bg-slate-600/50" />
              <div className="w-4 h-0.5 bg-slate-600/50 rounded" />
            </div>
            {/* Desk surface */}
            <div className="w-20 h-3 bg-amber-900/30 rounded-sm border-t border-amber-800/40 mt-0.5" />
            {/* Desk legs */}
            <div className="flex justify-between w-18 -mt-px">
              <div className="w-1 h-3 bg-amber-900/25" />
              <div className="w-1 h-3 bg-amber-900/25" />
            </div>
            {/* Chair */}
            <div className="w-8 h-5 bg-slate-600/20 rounded-t-lg border border-slate-500/20 mt-1" />
          </div>
        ))}

        {/* Water Cooler with drip */}
        <div className="absolute left-[180px] top-[300px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-10 h-14 bg-sky-200/80 rounded-t-full shadow-inner border border-sky-300" />
          <div className="w-8 h-12 bg-muted-foreground/40 rounded-b flex items-center justify-center relative">
            <div className="w-1 h-3 bg-sky-400 rounded-b mt-2" />
            {/* Drip animation */}
            <div
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400/80"
              style={{
                animation: "drip 2.5s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        {/* Conference Table with chairs */}
        <div className="absolute left-[800px] top-[400px] -translate-x-1/2 -translate-y-1/2 w-64 h-24 bg-amber-900/25 rounded-full border border-amber-800/30 shadow flex items-center justify-center">
          <div className="w-56 h-16 bg-amber-900/15 rounded-full border border-amber-800/20" />
        </div>
        {TABLE_CHAIRS.map((chair) => (
          <div
            key={`chair-${chair.x}-${chair.y}`}
            className="absolute w-4 h-4 rounded-full bg-slate-600/20 border border-slate-500/20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: chair.x, top: chair.y }}
          />
        ))}

        {/* Plants - multi-leaf */}
        <div className="absolute left-[120px] top-[500px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="relative w-14 h-16">
            <div className="absolute left-1 top-2 w-10 h-12 bg-emerald-600/70 rounded-full" />
            <div className="absolute left-4 top-0 w-8 h-10 bg-emerald-500/80 rounded-full" />
            <div className="absolute left-0 top-4 w-7 h-9 bg-emerald-400/60 rounded-full" />
          </div>
          <div className="w-8 h-6 bg-amber-800/80 rounded-b border-t-2 border-amber-900/60" />
        </div>

        <div className="absolute left-[1480px] top-[500px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="relative w-14 h-16">
            <div className="absolute left-2 top-1 w-10 h-12 bg-emerald-600/70 rounded-full" />
            <div className="absolute left-0 top-3 w-8 h-10 bg-emerald-500/80 rounded-full" />
            <div className="absolute left-5 top-0 w-7 h-9 bg-emerald-400/60 rounded-full" />
          </div>
          <div className="w-8 h-6 bg-amber-800/80 rounded-b border-t-2 border-amber-900/60" />
        </div>

        {/* Coffee Bar */}
        <div className="absolute left-[1440px] top-[100px] -translate-x-1/2 -translate-y-1/2">
          <div className="w-24 h-32 bg-slate-800 rounded border-2 border-slate-700 shadow-lg flex flex-col gap-2 p-2">
            <div className="h-4 bg-slate-900 rounded flex items-center justify-center">
              <CoffeeIcon className="size-3 text-amber-400/80" />
            </div>
            <div className="flex-1 bg-slate-900 rounded grid grid-cols-2 grid-rows-3 gap-1 p-1">
              {[...Array(6)].map((_, idx) => (
                <div key={`snack-${idx}`} className="bg-amber-700/60 rounded block" />
              ))}
            </div>
            <div className="h-8 bg-slate-700 rounded flex items-center px-1 gap-1">
              <div className="w-4 h-4 bg-green-500 rounded-sm" />
              <div className="w-2 h-4 bg-red-500 rounded-sm ml-auto" />
            </div>
          </div>
        </div>

        {/* --- BOTS (Dynamic) --- */}
        {bots.map((bot) => {
          const state = botStates[bot.id];
          const pos = state ?? { x: bot.deskLocation.x, y: bot.deskLocation.y };
          const transitionMs = state?.transitionMs ?? 2000;
          const facingLeft = state?.facingLeft ?? false;
          const thoughtEmoji = state?.thoughtEmoji ?? null;
          const isHovered = hoveredBotId === bot.id;

          return (
            <div
              key={bot.id}
              className="absolute top-0 left-0 flex flex-col items-center cursor-pointer group"
              style={{
                transform: `translate(${pos.x - 20}px, ${pos.y - 30}px)`,
                transition: `transform ${transitionMs}ms ease-in-out`,
                zIndex: isHovered ? 9999 : Math.round(pos.y),
                width: 40,
              }}
              onClick={() => handleBotClick(bot.id)}
              onMouseEnter={() => setHoveredBotId(bot.id)}
              onMouseLeave={() => setHoveredBotId(null)}
            >
              {/* Hover Info Card */}
              {isHovered && (
                <div
                  className={`absolute ${pos.y < 80 ? "top-full mt-2" : "bottom-full mb-2"} left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg shadow-lg p-2.5 text-xs pointer-events-none whitespace-nowrap z-10`}
                >
                  <div className="font-semibold text-foreground mb-1">
                    {bot.title.slice(0, 30)}{bot.title.length > 30 ? "..." : ""}
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        bot.isActive ? "bg-green-500" : bot.isError ? "bg-red-500" : "bg-muted-foreground/50"
                      }`}
                    />
                    <span className={bot.isActive ? "text-green-500" : bot.isError ? "text-red-500" : "text-muted-foreground"}>
                      {bot.isActive ? "Running" : bot.isError ? "Error" : "Idle"}
                    </span>
                  </div>
                  <div className="text-muted-foreground/70">{bot.model}</div>
                  <div className="text-muted-foreground/40 mt-1 text-[10px]">Click to open</div>
                </div>
              )}

              {/* Speech bubble for active bots */}
              {bot.isActive && (
                <div className="absolute -top-5 left-full -ml-1 bg-background rounded-lg px-2 py-0.5 text-xs shadow border border-border/60 pointer-events-none flex gap-0.5">
                  <span className="inline-block w-1 h-1 rounded-full bg-primary" style={{ animation: "typingDot 1.2s ease-in-out infinite" }} />
                  <span className="inline-block w-1 h-1 rounded-full bg-primary" style={{ animation: "typingDot 1.2s ease-in-out 0.2s infinite" }} />
                  <span className="inline-block w-1 h-1 rounded-full bg-primary" style={{ animation: "typingDot 1.2s ease-in-out 0.4s infinite" }} />
                </div>
              )}

              {/* Thought bubble for idle bots */}
              {!bot.isActive && !bot.isError && thoughtEmoji && (
                <div className="absolute -top-7 left-full -ml-2 pointer-events-none flex items-end gap-0.5">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 -mb-0.5" />
                  <div className="bg-background/90 rounded-full px-1.5 py-0.5 text-xs shadow border border-border/40">
                    {thoughtEmoji}
                  </div>
                </div>
              )}

              {/* Bot Avatar */}
              <div
                className={`relative flex flex-col items-center transition-transform duration-200 ${
                  isHovered ? "scale-110" : ""
                }`}
                style={{ transform: facingLeft ? "scaleX(-1)" : undefined }}
              >
                {/* Head */}
                <div
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                    bot.isActive
                      ? `${bot.color.bg}/20 ring-2 ${bot.color.ring} border ${bot.color.border}`
                      : bot.isError
                        ? "bg-red-500/20 ring-2 ring-red-400/60 border border-red-400"
                        : `${bot.color.bg}/15 border ${bot.color.border}/50 opacity-80`
                  }`}
                >
                  <BotIcon
                    className={`size-4 ${
                      bot.isActive ? bot.color.text : bot.isError ? "text-destructive" : bot.color.text
                    }`}
                    style={bot.isActive ? { animation: "typing 1s ease-in-out infinite" } : undefined}
                  />
                  {bot.isActive && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                </div>
                {/* Body */}
                <div
                  className={`w-5 h-3 rounded-b-lg -mt-1 ${
                    bot.isActive
                      ? `${bot.color.bg}/25 border-x border-b ${bot.color.border}/50`
                      : bot.isError
                        ? "bg-red-500/15 border-x border-b border-red-400/30"
                        : `${bot.color.bg}/10 border-x border-b ${bot.color.border}/30 opacity-80`
                  }`}
                />
              </div>

              {/* Nameplate */}
              <div
                className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap border shadow-sm transition-opacity ${
                  bot.isActive
                    ? "border-primary/50 text-primary opacity-100 font-bold bg-background/90"
                    : "border-border/50 text-muted-foreground bg-background/90 opacity-0 group-hover:opacity-100"
                }`}
                style={facingLeft ? { transform: "scaleX(-1)" } : undefined}
              >
                {bot.title.slice(0, 15)}{bot.title.length > 15 ? "..." : ""}
              </div>
            </div>
          );
        })}

        {/* Keyframe animations */}
        <style>{`
          @keyframes typing {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-1.5px); }
          }
          @keyframes typingDot {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          @keyframes drip {
            0%, 100% { opacity: 0; transform: translateX(-50%) translateY(0); }
            30% { opacity: 0.8; }
            70% { opacity: 0.6; transform: translateX(-50%) translateY(4px); }
            90% { opacity: 0; transform: translateX(-50%) translateY(8px); }
          }
        `}</style>
      </div>
    </div>
  );
}
