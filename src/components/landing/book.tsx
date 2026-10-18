"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "~/lib/cn";

import { CompanyLogo } from "./company-logo";
import { ChartPage, money } from "./poster";
import { ACCOUNTS, CLASSES, MONTHS, SAMPLE_YEAR } from "./sample-year";
import { useReducedMotion } from "./use-motion";

const OPENING_WORTH = SAMPLE_YEAR[0]!.worth - SAMPLE_YEAR[0]!.change;
/** How long each page stays open while the book plays itself. */
const PAGE_MS = 3400;
/** After someone turns a page themselves, the book waits this long before playing again. */
const IDLE_MS = 12000;
/** Vertical strips the turning leaf is cut into; more strips make a smoother curl. */
const STRIPS = 10;
/** Peak curl across the whole leaf, in degrees, reached halfway through a turn. */
const CURL = 46;

const amount = (v: number) => v.toLocaleString("en-SG");
const classOf = (key: string) => CLASSES.find((c) => c.key === key)!;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const easeInOut = (u: number) =>
  u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
const easeOut = (u: number) => 1 - (1 - u) ** 3;

/** Paper grain shared by every page. */
const grain =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.09  0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0.22 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>\")";

function Paper({
  spine,
  className,
  children,
}: {
  spine: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("bg-paper relative overflow-hidden", className)}
      style={{ backgroundImage: grain }}
    >
      {children}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 w-[10%] from-black/18 to-transparent",
          spine === "left"
            ? "left-0 bg-gradient-to-r"
            : "right-0 bg-gradient-to-l",
        )}
      />
    </div>
  );
}

/** Left-hand page: the month's account balances, adding up to the net worth on the right. */
function LedgerPage({ month }: { month: number }) {
  const data = SAMPLE_YEAR[month]!;
  const previous = month === 0 ? OPENING_WORTH : SAMPLE_YEAR[month - 1]!.worth;

  return (
    <div className="text-paper-ink @container aspect-[400/520]">
      <div className="flex h-full flex-col px-[7%] pt-[5.5%] pb-[6%]">
        <div className="flex items-baseline justify-between border-b border-current/25 pb-[3%]">
          <span className="font-poster text-[3.5cqw] font-bold">Accounts</span>
          <span className="font-mono text-[2cqw] tracking-[0.14em]">
            SAMPLE PORTFOLIO
          </span>
        </div>

        <p className="font-poster mt-[6%] text-[10cqw] leading-none font-extrabold">
          {MONTHS[month]}
        </p>
        <p className="mt-[1.5%] font-mono text-[2.1cqw] tracking-[0.12em] opacity-60">
          BALANCES AT MONTH END, S$
        </p>

        <ul className="mt-[5%] divide-y divide-current/10 text-[3.25cqw]">
          {ACCOUNTS.map((a, i) => {
            const c = classOf(a.holds);
            return (
              <li key={a.name} className="flex items-center gap-[3%] py-[1.4%]">
                <CompanyLogo name={a.name} className="size-[7cqw]" />
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight font-medium">
                    {a.name}
                  </span>
                  <span className="block font-mono text-[2.1cqw] leading-tight opacity-55">
                    {c.label}
                  </span>
                </span>
                <span className="figures font-mono">
                  {amount(data.accounts[i]!)}
                </span>
              </li>
            );
          })}
        </ul>

        <dl className="mt-auto space-y-[2.5%] border-t border-current pt-[4%] text-[3.25cqw]">
          <div className="flex justify-between opacity-70">
            <dt>From {month === 0 ? "last December" : MONTHS[month - 1]}</dt>
            <dd className="figures font-mono">{amount(previous)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-70">Change</dt>
            <dd
              className={cn(
                "figures font-mono font-semibold",
                data.change >= 0 ? "text-art-green" : "text-art-red",
              )}
            >
              {data.change >= 0 ? "+" : "−"}
              {amount(Math.abs(data.change))}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-current/25 pt-[2.5%]">
            <dt className="font-poster text-[1.15em] font-bold">Net worth</dt>
            <dd className="figures font-poster text-[1.5em] font-extrabold">
              {money(data.worth)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Phones show one page, so the accounts that add up to it sit underneath. */
function LedgerStrip({ month }: { month: number }) {
  const data = SAMPLE_YEAR[month]!;
  return (
    <div className="bg-paper text-paper-ink mt-4 rounded-[6px] p-4 sm:hidden">
      <p className="font-mono text-[10px] tracking-[0.12em] uppercase opacity-60">
        {MONTHS[month]} · accounts
      </p>
      <ul className="mt-3 grid gap-x-5 gap-y-3 text-[13px] sm:grid-cols-2">
        {ACCOUNTS.map((a, i) => (
          <li key={a.name} className="flex items-center gap-2">
            <CompanyLogo name={a.name} className="size-6" />
            <span className="flex-1">{a.name}</span>
            <span className="figures font-mono text-[12px]">
              {amount(data.accounts[i]!)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-baseline justify-between border-t border-current/25 pt-3">
        <span className="text-[13px] opacity-70">Net worth</span>
        <span className="font-poster figures text-[22px] font-bold">
          {money(data.worth)}
        </span>
      </p>
    </div>
  );
}

/**
 * The turning leaf, cut into nested vertical strips. Each strip is hinged to the one before
 * it, so giving each a little extra rotation bends the sheet into a curl. The front shows the
 * earlier month's chart, the back the later month's accounts.
 */
function LeafStrip({
  index,
  front,
  back,
}: {
  index: number;
  front: number;
  back: number;
}) {
  // Shading runs as a gradient from this strip's angle to the next, so the curl has no bands.
  const next = Math.min(index + 1, STRIPS - 1);
  const shade = (from: number, to: number) =>
    `linear-gradient(90deg, rgb(0 0 0 / var(--s${from})), rgb(0 0 0 / var(--s${to})))`;
  return (
    <div
      className="absolute top-0 h-full origin-left [transform-style:preserve-3d]"
      style={{
        left: index === 0 ? 0 : "100%",
        width: index === 0 ? `${100 / STRIPS}%` : "100%",
        transform: `rotateY(var(--a${index}))`,
      }}
    >
      {/* Faces overlap their neighbours by a pixel to hide hairline seams. */}
      <div className="absolute inset-y-0 -right-px -left-px overflow-hidden [backface-visibility:hidden]">
        <div
          className="bg-paper absolute top-0 h-full"
          style={{
            left: `calc(${-index * 100}% + 1px)`,
            width: `${STRIPS * 100}%`,
            backgroundImage: grain,
          }}
        >
          <ChartPage month={front} write={1} />
        </div>
        <div
          className="absolute inset-0"
          style={{ background: shade(index, next) }}
        />
      </div>
      <div className="absolute inset-y-0 -right-px -left-px [transform:rotateY(180deg)] overflow-hidden [backface-visibility:hidden]">
        <div
          className="bg-paper absolute top-0 h-full"
          style={{
            left: `calc(${-(STRIPS - 1 - index) * 100}% + 1px)`,
            width: `${STRIPS * 100}%`,
            backgroundImage: grain,
          }}
        >
          <LedgerPage month={back} />
        </div>
        <div
          className="absolute inset-0"
          style={{ background: shade(next, index) }}
        />
      </div>
      {index < STRIPS - 1 ? (
        <LeafStrip index={index + 1} front={front} back={back} />
      ) : null}
    </div>
  );
}

type Turn = {
  /** Earlier month: its chart is the leaf's front; its accounts lie on the left beneath. */
  min: number;
  /** Later month: its accounts are the leaf's back; its chart lies on the right beneath. */
  max: number;
  /** 1 turns forward (right to left), −1 turns back. */
  dir: 1 | -1;
  mode: "auto" | "drag" | "peek";
};

/**
 * An open ledger, one month per spread. It plays through the year on its own; you can also
 * drag a page (or swipe on a phone), click either page, use the arrow keys, or pick a month.
 * Hovering near the right edge lifts the corner to show it can be turned.
 */
export function Book({
  className,
  onPageChange,
}: {
  className?: string;
  onPageChange?: (month: number) => void;
}) {
  const reduced = useReducedMotion();
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [write, setWrite] = useState(1);
  const [playing, setPlaying] = useState(true);

  const leafRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const castRightRef = useRef<HTMLDivElement>(null);
  const castLeftRef = useRef<HTMLDivElement>(null);

  const theta = useRef(0);
  const turnRef = useRef<Turn | null>(null);
  const frame = useRef(0);
  const pending = useRef<{
    target: number;
    ms: number;
    ease: (u: number) => number;
  } | null>(null);
  const lastTouch = useRef(-Infinity);
  const drag = useRef<{
    id: number;
    x0: number;
    started: boolean;
    velocity: number;
    lastX: number;
    lastT: number;
  } | null>(null);

  useEffect(() => onPageChange?.(page), [onPageChange, page]);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  /** Push the current angle into the leaf's CSS variables and the shadows it casts. */
  const apply = useCallback((deg: number) => {
    const leaf = leafRef.current;
    const current = turnRef.current;
    if (!leaf || !current) return;
    const lift = Math.sin((deg * Math.PI) / 180);
    const curl = CURL * lift * current.dir;
    const step = curl / (STRIPS - 1);
    let cumulative = deg - curl / 2;
    leaf.style.setProperty("--a0", `${-cumulative}deg`);
    for (let i = 0; i < STRIPS; i++) {
      if (i > 0) {
        cumulative += step;
        leaf.style.setProperty(`--a${i}`, `${-step}deg`);
      }
      const facing = Math.abs(Math.sin((cumulative * Math.PI) / 180));
      leaf.style.setProperty(`--s${i}`, String(0.05 + 0.4 * facing ** 1.4));
    }
    if (castRightRef.current) {
      castRightRef.current.style.opacity = String(deg < 90 ? 0.55 * lift : 0);
    }
    if (castLeftRef.current) {
      castLeftRef.current.style.opacity = String(deg > 90 ? 0.55 * lift : 0);
    }
  }, []);

  const finish = useCallback((deg: number) => {
    const current = turnRef.current;
    if (!current) return;
    const landed = deg >= 90 ? current.max : current.min;
    turnRef.current = null;
    setTurn(null);
    setPage(landed);
    // A page turned forward gets its new month drawn in after it lands.
    if (
      current.dir === 1 &&
      landed === current.max &&
      current.mode !== "peek"
    ) {
      const start = performance.now();
      const tick = (now: number) => {
        const u = clamp((now - start) / 900, 0, 1);
        setWrite(easeOut(u));
        if (u < 1) requestAnimationFrame(tick);
      };
      setWrite(0);
      requestAnimationFrame(tick);
    }
  }, []);

  const animateTo = useCallback(
    (
      target: number,
      ms: number,
      ease: (u: number) => number,
      done?: () => void,
    ) => {
      cancelAnimationFrame(frame.current);
      const from = theta.current;
      const start = performance.now();
      const tick = (now: number) => {
        const u = clamp((now - start) / ms, 0, 1);
        theta.current = from + (target - from) * ease(u);
        apply(theta.current);
        if (u < 1) frame.current = requestAnimationFrame(tick);
        else done?.();
      };
      frame.current = requestAnimationFrame(tick);
    },
    [apply],
  );

  /** Begin turning towards `to`; `animate` plays the whole turn, otherwise a drag drives it. */
  const begin = useCallback(
    (to: number, mode: Turn["mode"], startTheta?: number) => {
      if (to === page || to < 0 || to > 11) return false;
      const dir = to > page ? 1 : -1;
      const next: Turn = {
        min: Math.min(page, to),
        max: Math.max(page, to),
        dir,
        mode,
      };
      if (reduced) {
        setPage(to);
        return false;
      }
      turnRef.current = next;
      theta.current = startTheta ?? (dir === 1 ? 0 : 180);
      setTurn(next);
      setWrite(1);
      return true;
    },
    [page, reduced],
  );

  const turnTo = useCallback(
    (to: number) => {
      if (turnRef.current && turnRef.current.mode !== "peek") return;
      if (turnRef.current?.mode === "peek") {
        // Carry on from the lifted corner.
        turnRef.current = { ...turnRef.current, mode: "auto" };
        if (to === turnRef.current.max) {
          animateTo(180, 1000, easeInOut, () => finish(180));
          return;
        }
        animateTo(0, 150, easeOut, () => finish(0));
        return;
      }
      if (begin(to, "auto")) {
        const dir = to > page ? 1 : -1;
        pending.current = {
          target: dir === 1 ? 180 : 0,
          ms: Math.abs(to - page) > 1 ? 1300 : 1100,
          ease: easeInOut,
        };
      }
    },
    [animateTo, begin, finish, page],
  );

  // Once the leaf is mounted, place it and start any queued animation.
  useLayoutEffect(() => {
    if (!turn) return;
    apply(theta.current);
    const queued = pending.current;
    if (queued) {
      pending.current = null;
      animateTo(queued.target, queued.ms, queued.ease, () =>
        finish(queued.target),
      );
    }
  }, [turn, apply, animateTo, finish]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Play through the year; December rests a little longer, then the book closes back to January.
  useEffect(() => {
    if (!playing || turn) return;
    const base = page === 11 ? PAGE_MS * 2 : PAGE_MS;
    const idleLeft = IDLE_MS - (performance.now() - lastTouch.current);
    const timer = window.setTimeout(
      () => turnTo(page === 11 ? 0 : page + 1),
      Math.max(base, idleLeft),
    );
    return () => window.clearTimeout(timer);
  }, [playing, turn, page, turnTo]);

  const touched = () => {
    lastTouch.current = performance.now();
  };

  /** Page geometry: where the spine is and how wide one page is. */
  function geometry() {
    const right = rightRef.current!.getBoundingClientRect();
    const twoPages = !!leftRef.current?.offsetParent;
    return { spine: right.left, width: right.width, twoPages };
  }

  function angleFor(clientX: number, dir: 1 | -1, x0: number) {
    const g = geometry();
    if (g.twoPages) {
      // The page edge follows the pointer: edge x = spine + width·cos θ.
      return (
        (Math.acos(clamp((clientX - g.spine) / g.width, -1, 1)) * 180) / Math.PI
      );
    }
    const travel = ((clientX - x0) / g.width) * 180;
    return dir === 1 ? clamp(-travel, 0, 180) : clamp(180 - travel, 0, 180);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (reduced || (turnRef.current && turnRef.current.mode !== "peek")) return;
    touched();
    drag.current = {
      id: event.pointerId,
      x0: event.clientX,
      started: false,
      velocity: 0,
      lastX: event.clientX,
      lastT: performance.now(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) {
      // Lift the corner when a mouse rests near the right edge.
      if (event.pointerType !== "mouse" || turnRef.current?.mode === "auto")
        return;
      const g = geometry();
      const nearEdge =
        event.clientX > g.spine + g.width * 0.84 &&
        event.clientX < g.spine + g.width;
      if (nearEdge && !turnRef.current && page < 11) {
        if (begin(page + 1, "peek", 0)) {
          pending.current = { target: 18, ms: 280, ease: easeOut };
        }
      } else if (!nearEdge && turnRef.current?.mode === "peek") {
        animateTo(0, 220, easeOut, () => finish(0));
      }
      return;
    }
    const now = performance.now();
    d.velocity = (event.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = event.clientX;
    d.lastT = now;

    if (!d.started) {
      const dx = event.clientX - d.x0;
      if (Math.abs(dx) < 6) return;
      const dir = dx < 0 ? 1 : -1;
      const target = page + dir;
      if (turnRef.current?.mode === "peek" && dir === 1) {
        turnRef.current = { ...turnRef.current, mode: "drag" };
        setTurn(turnRef.current);
      } else {
        if (turnRef.current?.mode === "peek") {
          cancelAnimationFrame(frame.current);
          turnRef.current = null;
          setTurn(null);
        }
        if (!begin(target, "drag")) {
          drag.current = null;
          return;
        }
      }
      d.started = true;
      cancelAnimationFrame(frame.current);
    }
    const current = turnRef.current;
    if (!current) return;
    theta.current = angleFor(event.clientX, current.dir, d.x0);
    apply(theta.current);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    touched();
    if (!d.started) {
      // A click: the right page turns forward, the left page turns back.
      const g = geometry();
      turnTo(
        event.clientX >= g.spine
          ? Math.min(11, page + 1)
          : Math.max(0, page - 1),
      );
      return;
    }
    const current = turnRef.current;
    if (!current) return;
    // Finish the turn if it is past the point of no return or was flicked.
    const flick = d.velocity * -current.dir;
    const forward =
      current.dir === 1
        ? theta.current > 70 || flick > 0.6
        : !(theta.current < 110 || flick > 0.6);
    const target = forward ? 180 : 0;
    const ms = 180 + 520 * (Math.abs(target - theta.current) / 180);
    animateTo(target, ms, easeOut, () => finish(target));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    touched();
    turnTo(clamp(page + (event.key === "ArrowRight" ? 1 : -1), 0, 11));
  }

  const leftMonth = turn ? turn.min : page;
  const rightMonth = turn ? turn.max : page;
  const rightWrite = turn
    ? turn.dir === 1 && turn.mode !== "peek"
      ? 0
      : 1
    : write;

  return (
    <figure className={cn("relative", className)}>
      <div
        ref={bookRef}
        role="group"
        aria-roledescription="book"
        aria-label={`Sample ledger, ${MONTHS[page]}. Use the arrow keys to turn pages.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (!drag.current && turnRef.current?.mode === "peek") {
            animateTo(0, 220, easeOut, () => finish(0));
          }
        }}
        onKeyDown={onKeyDown}
        className="relative grid cursor-grab touch-pan-y overflow-hidden rounded-[6px] shadow-[0_40px_90px_-30px_rgb(0_0_0/0.85),0_0_0_1px_rgb(0_0_0/0.45)] select-none [perspective:2600px] focus-visible:outline-offset-4 active:cursor-grabbing sm:grid-cols-2 sm:overflow-visible"
      >
        <div ref={leftRef} className="hidden sm:block">
          <Paper spine="right" className="rounded-l-[6px]">
            <LedgerPage month={leftMonth} />
            <div
              ref={castLeftRef}
              className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/60 via-black/15 to-transparent opacity-0"
            />
          </Paper>
        </div>

        <div ref={rightRef}>
          <Paper spine="left" className="rounded-[6px] sm:rounded-l-none">
            <ChartPage month={rightMonth} write={rightWrite} />
            <div
              ref={castRightRef}
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-black/15 to-transparent opacity-0"
            />
            {/* Dog-ear hint that the page can be turned */}
            {page < 11 && !turn ? (
              <div className="pointer-events-none absolute right-0 bottom-0 size-7 bg-[linear-gradient(135deg,transparent_50%,rgb(0_0_0/0.12)_50%,rgb(0_0_0/0.04))]" />
            ) : null}
          </Paper>
        </div>

        {turn ? (
          <div
            ref={leafRef}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-full [transform-style:preserve-3d] sm:left-1/2 sm:w-1/2"
          >
            <LeafStrip index={0} front={turn.min} back={turn.max} />
          </div>
        ) : null}

        {/* Spine */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-black/40 sm:block" />
      </div>

      {/* Page controls */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            touched();
            turnTo(Math.max(0, page - 1));
          }}
          disabled={page === 0}
          aria-label="Previous month"
          className="text-ink-2 hover:bg-wash hover:text-ink rounded-ctl grid size-9 place-items-center transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <ol className="flex flex-1 justify-between gap-0.5">
          {MONTHS.map((m, i) => (
            <li key={m} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  touched();
                  turnTo(i);
                }}
                aria-label={m}
                aria-current={i === page ? "page" : undefined}
                className={cn(
                  "group flex h-9 w-full flex-col items-center justify-center gap-1 rounded-md font-mono text-[11px] transition-colors",
                  i === page ? "text-ink" : "text-ink-3 hover:text-ink-2",
                )}
              >
                {m[0]}
                <span
                  className={cn(
                    "h-[3px] w-full max-w-6 rounded-full transition-colors",
                    i === page
                      ? "bg-ink"
                      : i < page
                        ? "bg-ink-3/60"
                        : "bg-line-2",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            touched();
            turnTo(Math.min(11, page + 1));
          }}
          disabled={page === 11}
          aria-label="Next month"
          className="text-ink-2 hover:bg-wash hover:text-ink rounded-ctl grid size-9 place-items-center transition-colors disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            lastTouch.current = -Infinity;
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pause" : "Play"}
          className="text-ink-2 hover:bg-wash hover:text-ink rounded-ctl border-line ml-1 grid size-9 place-items-center border transition-colors"
        >
          {playing ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
      </div>

      <LedgerStrip month={page} />

      <figcaption className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 text-[12px] leading-relaxed">
        <span className="bg-ink-3 mt-2 h-px w-6" />
        <div>
          <p className="text-ink font-medium">
            Nº 01 — A year of one portfolio
          </p>
          <p className="text-ink-3 max-w-xl">
            <span className="hidden sm:inline">
              The accounts on the left add up to the net worth on the
              right.{" "}
            </span>
            The line shows net worth so far, and the allocation below shows what
            it&apos;s made of. Drag a page corner, click a page or pick a month
            to turn. Sample figures.
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
