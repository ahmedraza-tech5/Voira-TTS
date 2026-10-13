"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioWaveform,
  ChevronDown,
  History,
  HelpCircle,
  Mic,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { VoiraMark, VoiraWordmark } from "@/components/voira-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Health } from "@/lib/types";

const NAV = [
  { href: "/", label: "Studio", icon: Sparkles },
  { href: "/voices", label: "Voices", icon: Mic },
  { href: "/cloning", label: "Voice Cloning", icon: AudioWaveform },
  { href: "/history", label: "History", icon: History },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Studio",
    description: "Write a script, pick a voice, generate natural speech.",
  },
  "/voices": {
    title: "Voices",
    description: "Browse the built-in voice and your cloned voices.",
  },
  "/cloning": {
    title: "Voice Cloning",
    description: "Create a voice from a reference clip you have permission to use.",
  },
  "/history": {
    title: "History",
    description: "Every generation, ready to replay or download.",
  },
  "/faq": {
    title: "FAQ",
    description: "Answers about generation, cloning, downloads and privacy.",
  },
  "/settings": {
    title: "Settings",
    description: "Backend connection, model status and preferences.",
  },
};

function StatusPill() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await api.health();
        if (alive) {
          setHealth(h);
          setDown(false);
        }
      } catch {
        if (alive) setDown(true);
      }
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const state = down ? "offline" : health?.engine.state ?? "…";
  const ready = !down && health?.engine.state === "ready";
  const loading = !down && health?.engine.state === "loading";
  const label = down
    ? "Backend offline"
    : ready
      ? `${health?.engine.model_label ?? "Model"} · ${health?.engine.device}`
      : loading
        ? "Loading model…"
        : state === "error"
          ? "Model error"
          : "Model idle";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-md transition-colors",
        ready
          ? "border-success/25 bg-success/10 text-success shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
          : loading
            ? "border-amber-200 bg-amber-50/80 text-amber-600"
            : down || state === "error"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-border bg-muted/70 text-muted-foreground"
      )}
      title={health ? JSON.stringify(health.engine) : "Backend unreachable"}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          ready
            ? "bg-success"
            : loading
              ? "bg-amber-500 animate-pulse"
              : down || state === "error"
                ? "bg-destructive"
                : "bg-muted-foreground"
        )}
      />
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const meta =
    PAGE_META[pathname] ?? PAGE_META["/"] ?? { title: "Voice Studio", description: "" };

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <VoiraMark className="size-9" />
          <span className="flex flex-col">
            <VoiraWordmark className="text-[16px] font-semibold leading-none tracking-tight" />
            <span className="mt-1 text-[9.5px] font-semibold uppercase leading-none tracking-[0.16em] text-muted-foreground">
              AI Voice Studio
            </span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-brand/25",
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("size-[18px]", active ? "text-brand" : "text-muted-foreground")}
                  strokeWidth={2}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <div className="glass-tint rounded-[14px] p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <VoiraMark className="size-4 shadow-none" />
              <VoiraWordmark className="text-xs font-semibold" />
              <span className="font-normal text-muted-foreground">engine</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ultra-realistic voice model, served from your own backend.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-[248px]">
        <header className="glass sticky top-0 z-20 border-x-0 border-t-0">
          {/* ambient brand wash + bottom light-catch, purely decorative */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand/[0.08] via-transparent to-[#D946EF]/[0.08]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent"
          />
          <div className="relative flex h-16 items-center justify-between gap-4 px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className="shrink-0 rounded-[12px] outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
                aria-label="Voira home"
              >
                <VoiraMark className="size-9 transition-transform duration-200 hover:scale-105" />
              </Link>
              <div className="min-w-0">
                <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight md:text-xl">
                  <VoiraWordmark className="shrink-0" />
                  <span aria-hidden="true" className="text-border">
                    /
                  </span>
                  <span className="truncate">{meta.title}</span>
                </h1>
                <p className="hidden truncate text-sm text-muted-foreground md:block">
                  {meta.description}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden sm:block">
                <StatusPill />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-brand/25">
                  <Avatar className="size-8 border border-border shadow-[0_2px_8px_-4px_rgba(99,91,255,0.6)]">
                    <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand">
                      VO
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Signed in as Guest
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link href="/settings" />}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/faq" />}>
                    Help &amp; FAQ
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled className="justify-between">
                    API status
                    <Badge variant="outline" className="font-mono text-[10px]">
                      REST
                    </Badge>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 px-2 py-1.5 backdrop-blur md:hidden">
        {NAV.slice(0, 5).map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium",
                active ? "text-brand" : "text-muted-foreground"
              )}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
