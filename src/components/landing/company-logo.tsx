import Image from "next/image";

import { cn } from "~/lib/cn";

export const COMPANY_LOGOS = {
  IBKR: "/logos/ibkr.svg",
  moomoo: "/logos/moomoo.svg",
  Endowus: "/logos/endowus.svg",
  Tiger: "/logos/tiger.svg",
  Longbridge: "/logos/longbridge.svg",
  Coinhako: "/logos/coinhako.svg",
} as const;

export const COLORED_COMPANY_LOGOS = {
  IBKR: "/logos/ibkr-color.svg",
  moomoo: "/logos/moomoo-color.svg",
  Endowus: "/logos/endowus-color.svg",
  Tiger: "/logos/tiger-color.svg",
  Longbridge: "/logos/longbridge-color.svg",
  Coinhako: "/logos/coinhako-color.svg",
} as const satisfies Record<keyof typeof COMPANY_LOGOS, string>;

export function CompanyLogo({
  name,
  className,
}: {
  name: keyof typeof COMPANY_LOGOS;
  className?: string;
}) {
  return (
    <span className={cn("relative block shrink-0", className)}>
      <Image
        src={COMPANY_LOGOS[name]}
        alt=""
        fill
        sizes="34px"
        loading="eager"
        unoptimized
        className="object-contain"
      />
    </span>
  );
}
