import Image from "next/image";

import { cn } from "~/lib/cn";

/** Institution keys (see src/presets) that have a logo in /public/logos. */
const LOGOS: Record<string, string> = {
  ibkr: "/logos/ibkr-color.svg",
  moomoo: "/logos/moomoo-color.svg",
  endowus: "/logos/endowus-color.svg",
  tiger: "/logos/tiger-color.svg",
  longbridge: "/logos/longbridge-color.svg",
  coinhako: "/logos/coinhako-color.svg",
};

function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/);
  return (
    words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)
  ).toUpperCase();
}

/** The bank or broker's logo where we have one, otherwise its initials on a tile. */
export function InstitutionMark({
  institutionKey,
  name,
  className,
}: {
  institutionKey: string | null;
  name: string;
  className?: string;
}) {
  const logo = institutionKey ? LOGOS[institutionKey] : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        "border-line-2 relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[8px] border",
        logo ? "bg-white" : "bg-wash",
        className,
      )}
    >
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={26}
          height={26}
          unoptimized
          className="size-[65%] object-contain"
        />
      ) : (
        <span className="font-poster text-ink-2 text-[15px] font-bold">
          {initials(name)}
        </span>
      )}
    </span>
  );
}
