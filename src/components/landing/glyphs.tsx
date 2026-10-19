"use client";

import { COLORED_COMPANY_LOGOS } from "./company-logo";
import { money } from "./poster";
import { SAMPLE_YEAR } from "./sample-year";
import { useReducedMotion } from "./use-motion";

const INK = "var(--color-paper-ink)";
const PAPER = "var(--color-paper)";
// SMIL can't interpolate CSS variables, so animated colours use the literal inks.
const HEX = { ink: "#16130f", green: "#1f8a5b", red: "#e0442b" };
/** Brand-color versions of the company marks used by the sample account ledger. */
const TILES = [
  { name: "IBKR", x: 24, y: 18, r: -8 },
  { name: "moomoo", x: 96, y: 18, r: 6 },
  { name: "Tiger", x: 16, y: 60, r: 5 },
  { name: "Longbridge", x: 104, y: 60, r: -6 },
  { name: "Endowus", x: 26, y: 102, r: 7 },
  { name: "Coinhako", x: 94, y: 102, r: -5 },
] as const;
const GATHER_DUR = "6.5s";

/** I. Add your accounts — the institutions' tiles pile up and become one total. */
export function GatherGlyph() {
  const still = useReducedMotion();
  const total = money(SAMPLE_YEAR[11]!.worth);
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {TILES.map((t, i) => {
        // Each tile sets off a beat after the last and lands on a slightly offset pile.
        const dx = 60 - t.x;
        const dy = 60 + (i - 2.5) * 1.6 - t.y;
        const leave = (0.08 + i * 0.05).toFixed(2);
        const land = (0.2 + i * 0.05).toFixed(2);
        return (
          <g key={t.name} opacity={still ? 1 : 0}>
            {still ? null : (
              <>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values={`0 0; 0 0; ${dx} ${dy}; ${dx} ${dy}; 0 0`}
                  keyTimes={`0; ${leave}; ${land}; 0.9; 1`}
                  calcMode="spline"
                  keySplines="0 0 1 1; 0.55 0 0.25 1; 0 0 1 1; 0 0 1 1"
                  dur={GATHER_DUR}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0; 1; 1; 0; 0; 1"
                  keyTimes="0; 0.05; 0.47; 0.53; 0.94; 1"
                  dur={GATHER_DUR}
                  repeatCount="indefinite"
                />
              </>
            )}
            <g transform={`translate(${t.x} ${t.y}) rotate(${t.r})`}>
              <image
                href={COLORED_COMPANY_LOGOS[t.name]}
                x="-12"
                y="-12"
                width="24"
                height="24"
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          </g>
        );
      })}

      {/* The one number they add up to */}
      <g transform="translate(60 60)" opacity="0">
        {still ? null : (
          <>
            <animate
              attributeName="opacity"
              values="0; 0; 1; 1; 0; 0"
              keyTimes="0; 0.47; 0.54; 0.86; 0.92; 1"
              dur={GATHER_DUR}
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="60 65; 60 65; 60 60; 60 60; 60 60; 60 65"
              keyTimes="0; 0.47; 0.54; 0.86; 0.92; 1"
              dur={GATHER_DUR}
              repeatCount="indefinite"
            />
          </>
        )}
        <TotalCard total={total} />
      </g>
      {still ? (
        <g transform="translate(60 60)">
          <TotalCard total={total} />
        </g>
      ) : null}
    </svg>
  );
}

function TotalCard({ total }: { total: string }) {
  return (
    <>
      <rect
        x="-30"
        y="-19"
        width="60"
        height="38"
        rx="3"
        fill={PAPER}
        stroke={HEX.ink}
        strokeOpacity="0.4"
        strokeWidth="0.6"
      />
      <text
        y="-7"
        textAnchor="middle"
        fill={INK}
        className="font-mono"
        fontSize="4.6"
        letterSpacing="0.8"
      >
        NET WORTH
      </text>
      <text
        y="5"
        textAnchor="middle"
        fill={INK}
        className="font-poster figures"
        fontSize="10"
        fontWeight="800"
      >
        {total}
      </text>
      {[HEX.red, "#e8b13a", HEX.green, "#2d4fa3"].map((c, i) => (
        <rect key={c} x={-30 + i * 15} y="15" width="15" height="4" fill={c} />
      ))}
    </>
  );
}

/** II. Read — a statement is scanned and each line is sorted into in or out. */
export function ReadGlyph() {
  const still = useReducedMotion();
  const lines = [30, 42, 54, 66, 78, 90];
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <rect x="28" y="14" width="64" height="92" fill={PAPER} />
      <path d="M78 14h14v14z" fill="var(--color-surface)" />
      <path d="M78 14v14h14z" fill="#d9cdb3" />
      {lines.map((y, i) => {
        const color = i % 3 === 1 ? HEX.red : HEX.green;
        const at = ((y - 12) / 92) * 0.7;
        return (
          <line
            key={y}
            x1="36"
            x2={i % 2 ? 70 : 84}
            y1={y}
            y2={y}
            strokeWidth="4"
            stroke={still ? color : HEX.ink}
          >
            {still ? null : (
              <animate
                attributeName="stroke"
                values={`${HEX.ink}; ${HEX.ink}; ${color}; ${color}; ${HEX.ink}`}
                keyTimes={`0; ${at.toFixed(3)}; ${(at + 0.02).toFixed(3)}; 0.92; 1`}
                dur="4.5s"
                repeatCount="indefinite"
              />
            )}
          </line>
        );
      })}
      {still ? null : (
        <g>
          <rect
            x="20"
            y="-3"
            width="80"
            height="6"
            fill="var(--color-art-mustard)"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 12; 0 106; 0 106; 0 12"
            keyTimes="0; 0.7; 0.92; 1"
            dur="4.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1; 1; 0; 0"
            keyTimes="0; 0.7; 0.76; 1"
            dur="4.5s"
            repeatCount="indefinite"
          />
        </g>
      )}
    </svg>
  );
}

const LOCK_DUR = "4.2s";

/** III. Keep it to yourself — a padlock snaps shut, its keyhole turns green, then reopens. */
export function KeepGlyph() {
  const still = useReducedMotion();
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {/* Ripple when it locks */}
      {still ? null : (
        <circle
          cx="60"
          cy="76"
          r="30"
          fill="none"
          stroke="#e8b13a"
          strokeWidth="2.5"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="30; 30; 42; 42"
            keyTimes="0; 0.42; 0.7; 1"
            dur={LOCK_DUR}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0; 0; 0.9; 0; 0"
            keyTimes="0; 0.42; 0.45; 0.7; 1"
            dur={LOCK_DUR}
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Shackle: up while open, drops into the body to lock */}
      <g>
        {still ? null : (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 -13; 0 -13; 0 0; 0 0; 0 -13"
            keyTimes="0; 0.28; 0.42; 0.86; 1"
            calcMode="spline"
            keySplines="0 0 1 1; 0.7 0 0.9 0.6; 0 0 1 1; 0.4 0 0.2 1"
            dur={LOCK_DUR}
            repeatCount="indefinite"
          />
        )}
        <path
          d="M44 62V46a16 16 0 0 1 32 0v16"
          fill="none"
          stroke="#2d4fa3"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>

      {/* Body, with a small knock as the shackle lands */}
      <g>
        {still ? null : (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 0; 0 2; 0 0; 0 0"
            keyTimes="0; 0.42; 0.45; 0.5; 1"
            dur={LOCK_DUR}
            repeatCount="indefinite"
          />
        )}
        <rect
          x="32"
          y="58"
          width="56"
          height="44"
          rx="6"
          fill={PAPER}
          stroke={HEX.ink}
          strokeOpacity="0.35"
          strokeWidth="0.8"
        />
        <g fill={still ? HEX.green : HEX.ink}>
          {still ? null : (
            <animate
              attributeName="fill"
              values={`${HEX.ink}; ${HEX.ink}; ${HEX.green}; ${HEX.green}; ${HEX.ink}; ${HEX.ink}`}
              keyTimes="0; 0.43; 0.46; 0.86; 0.9; 1"
              dur={LOCK_DUR}
              repeatCount="indefinite"
            />
          )}
          <circle cx="60" cy="76" r="5.5" />
          <path d="M56.5 78h7l2 13h-11z" />
        </g>
      </g>
    </svg>
  );
}

/** Rotating circular seal; used as a sign-in button. */
export function Seal({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Sign in"
      className="group bg-paper text-paper-ink relative grid size-28 place-items-center rounded-full shadow-[0_14px_40px_-12px_rgb(0_0_0/0.8)] transition-transform duration-300 hover:scale-105 focus-visible:outline-offset-4"
    >
      <svg
        viewBox="0 0 120 120"
        className="animate-spin-slow absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <path
            id="seal-ring"
            d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"
          />
        </defs>
        <text
          fontSize="9.5"
          letterSpacing="2.6"
          className="font-mono"
          fill="currentColor"
        >
          <textPath href="#seal-ring">
            SIGN IN · FINFOLIO · INVITE ONLY ·
          </textPath>
        </text>
      </svg>
      <span className="bg-art-red group-hover:bg-art-cobalt grid size-10 place-items-center rounded-full text-white transition-colors">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path
            d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      </span>
    </button>
  );
}
