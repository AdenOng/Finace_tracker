"use client";
import { useT } from "~/i18n/client";
import { LinkTabs } from "~/components/ui/link-tabs";

export function AiTabs() {
  const t = useT();
  return (
    <LinkTabs
      label={t.admin.tabs.aiSections}
      tabs={[
        { href: "/admin/ai", label: t.admin.tabs.providers },
        { href: "/admin/ai/usage", label: t.admin.tabs.usageCost },
        { href: "/admin/ai/playground", label: t.admin.tabs.playground },
      ]}
    />
  );
}

export function DataTabs() {
  const t = useT();
  return (
    <LinkTabs
      label={t.admin.tabs.dataSections}
      tabs={[
        { href: "/admin/data", label: t.admin.tabs.backups },
        { href: "/admin/data/market", label: t.admin.tabs.marketData },
        { href: "/admin/data/storage", label: t.admin.tabs.storage },
        { href: "/admin/data/presets", label: t.admin.tabs.dataPacks },
      ]}
    />
  );
}
