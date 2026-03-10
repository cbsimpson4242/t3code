import { useEffect, useState, useMemo } from "react";
import { BotIcon, MonitorIcon } from "lucide-react";
import { useStore } from "../store";

// Office Configuration
const GRID_SIZE = 40;
const ROOM_WIDTH = 800;
const ROOM_HEIGHT = 600;

// POIs (Points of Interest) for idle bots
const POIS = [
  { type: "water_cooler", x: 100, y: 300 },
  { type: "plant", x: 50, y: 500 },
  { type: "plant", x: 750, y: 500 },
  { type: "conference_table_1", x: 400, y: 450 },
  { type: "conference_table_2", x: 450, y: 400 },
  { type: "conference_table_3", x: 350, y: 400 },
  { type: "snack_bar", x: 700, y: 100 },
];

function getRandomPOI() {
  return POIS[Math.floor(Math.random() * POIS.length)]!;
}

// Ensure unique desk locations based on thread index
function getDeskLocation(index: number) {
  const desksPerRow = 5;
  const row = Math.floor(index / desksPerRow);
  const col = index % desksPerRow;
  return {
    x: 150 + col * 120,
    y: 100 + row * 150,
  };
}

// Random variation for more natural movement
function jitter(num: number, amount = 15) {
  return num + (Math.random() * amount * 2 - amount);
}

export default function VirtualOffice() {
  const threads = useStore((store) => store.threads);

  // Each thread gets a mapped bot with internal state
  const bots = useMemo(() => {
    return threads.map((thread, i) => {
      const isActive =
        thread.session?.status === "running" ||
        thread.session?.orchestrationStatus === "running" ||
        thread.latestTurn?.state === "running";
        
      const isError = thread.session?.status === "error" || thread.latestTurn?.state === "error";

      return {
        id: thread.id,
        title: thread.title,
        deskLocation: getDeskLocation(i),
        isActive,
        isError,
      };
    });
  }, [threads]);

  // Keep track of the current position/target of each bot
  const [botPositions, setBotPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    // Initialize bots that don't have a position yet
    setBotPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const bot of bots) {
        if (!next[bot.id]) {
          // start at their desk
          next[bot.id] = { x: bot.deskLocation.x, y: bot.deskLocation.y };
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Main animation loop
    const intervalId = setInterval(() => {
      setBotPositions((prev) => {
        const next = { ...prev };
        let changed = false;

        for (const bot of bots) {
          const currentPos = prev[bot.id] || bot.deskLocation;
          
          if (bot.isActive) {
            // Must go to desk and stay there
            if (currentPos.x !== bot.deskLocation.x || currentPos.y !== bot.deskLocation.y) {
              next[bot.id] = { x: bot.deskLocation.x, y: bot.deskLocation.y };
              changed = true;
            } else {
              // slight jiggle while working
              if (Math.random() > 0.7) {
                 next[bot.id] = { x: bot.deskLocation.x + (Math.random() > 0.5 ? -2 : 2), y: bot.deskLocation.y };
                 changed = true;
              }
            }
          } else {
            // Idle behavior: wander occasionally
            if (Math.random() > 0.6) { // 40% chance to pick a new destination every tick
              const target = getRandomPOI();
              next[bot.id] = { x: jitter(target.x, 25), y: jitter(target.y, 25) };
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 3000); // Re-evaluate every 3s

    return () => clearInterval(intervalId);
  }, [bots]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 bg-background overflow-hidden min-h-[600px]">
      <div 
        className="relative shadow-2xl rounded-lg border border-border/50 bg-secondary/20 shrink-0 overflow-hidden"
        style={{ width: ROOM_WIDTH, height: ROOM_HEIGHT }}
      >
        {/* Floor Pattern */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(45deg, var(--color-border) 25%, transparent 25%, transparent 75%, var(--color-border) 75%, var(--color-border)), linear-gradient(45deg, var(--color-border) 25%, transparent 25%, transparent 75%, var(--color-border) 75%, var(--color-border))`,
            backgroundSize: `${GRID_SIZE * 2}px ${GRID_SIZE * 2}px`,
            backgroundPosition: `0 0, ${GRID_SIZE}px ${GRID_SIZE}px`
          }}
        />

        {/* --- ENVIRONMENTAL PROPS --- */}
        
        {/* Desks */}
        {bots.map((bot, i) => (
          <div
            key={`desk-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: bot.deskLocation.x, top: bot.deskLocation.y - 15 }}
          >
            <MonitorIcon className="size-6 text-blue-500/80 mb-1" />
            <div className="w-16 h-8 bg-muted-foreground/30 rounded border-t-2 border-muted-foreground/50 shadow-sm" />
          </div>
        ))}

        {/* Water Cooler */}
        <div className="absolute left-[100px] top-[300px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-10 h-14 bg-sky-200/80 rounded-t-full shadow-inner border border-sky-300" />
          <div className="w-8 h-12 bg-muted-foreground/40 rounded-b flex items-center justify-center">
            <div className="w-1 h-3 bg-sky-400 rounded-b mt-2" />
          </div>
        </div>

        {/* Conference Table */}
        <div className="absolute left-[400px] top-[400px] -translate-x-1/2 -translate-y-1/2 w-48 h-24 bg-muted-foreground/30 rounded-full border border-muted-foreground/50 shadow flex items-center justify-center">
            <div className="w-40 h-16 bg-muted-foreground/20 rounded-full border border-muted-foreground/30" />
        </div>

        {/* Plants */}
        <div className="absolute left-[50px] top-[500px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-12 h-16 bg-emerald-500/80 rounded-full shadow-sm" />
          <div className="w-8 h-10 bg-amber-800/80 rounded-b" />
        </div>
        
        <div className="absolute left-[750px] top-[500px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-12 h-16 bg-emerald-500/80 rounded-full shadow-sm border border-emerald-400/50" />
          <div className="w-8 h-10 bg-amber-800/80 rounded-b border-t-4 border-amber-900/60" />
        </div>

        {/* Snack Bar */}
        <div className="absolute left-[700px] top-[100px] -translate-x-1/2 -translate-y-1/2">
            <div className="w-24 h-32 bg-slate-800 rounded border-2 border-slate-700 shadow-lg flex flex-col gap-2 p-2">
               <div className="h-4 bg-slate-900 rounded" />
               <div className="flex-1 bg-slate-900 rounded grid grid-cols-2 grid-rows-3 gap-1 p-1">
                   {[...Array(6)].map((_, i) => <div key={i} className="bg-rose-500/80 rounded block" />)}
               </div>
               <div className="h-8 bg-slate-700 rounded flex items-center px-1 gap-1">
                  <div className="w-4 h-4 bg-green-500 rounded-sm" />
                  <div className="w-2 h-4 bg-red-500 rounded-sm ml-auto" />
               </div>
            </div>
        </div>

        {/* --- BOTS (Dynamic) --- */}
        {bots.map((bot) => {
          const pos = botPositions[bot.id] || bot.deskLocation;
          return (
            <div
              key={bot.id}
              className={`absolute top-0 left-0 flex flex-col items-center transition-all ease-in-out group -translate-x-1/2 -translate-y-1/2 ${
                bot.isActive ? "duration-[300ms]" : "duration-[3000ms]"
              }`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: Math.round(pos.y), // simple depth sorting
              }}
            >
              {/* Bot Character */}
              <div 
                className={`relative bg-background border rounded p-1 shadow ${
                   bot.isActive ? "border-primary shadow-primary/30 ring-1 ring-primary/40 bg-accent/30" : 
                   bot.isError ? "border-destructive shadow-destructive/30" : "border-border/60 opacity-90"
                }`}
              >
                  <BotIcon 
                    className={`size-6 ${
                      bot.isActive ? "text-primary animate-bounce" : bot.isError ? "text-destructive" : "text-purple-500" // using purple as base bot color
                    }`} 
                  />
                  {bot.isActive && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                    </span>
                  )}
              </div>
              
              {/* Nameplate - shown on hover or when active */}
              <div className={`mt-1 px-1.5 py-0.5 rounded bg-background/90 text-[10px] font-mono whitespace-nowrap border shadow-sm transition-opacity ${
                 bot.isActive ? "border-primary/50 text-primary opacity-100 font-bold" : "border-border/50 text-muted-foreground opacity-0 group-hover:opacity-100"
              }`}>
                {bot.title.slice(0, 15)}{bot.title.length > 15 ? "..." : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
