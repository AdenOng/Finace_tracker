import { LinkTabs } from "~/components/ui/link-tabs";

export function AiTabs() {
  return (
    <LinkTabs
      label="AI sections"
      tabs={[
        { href: "/admin/ai", label: "Providers" },
        { href: "/admin/ai/usage", label: "Usage & cost" },
        { href: "/admin/ai/playground", label: "Playground" },
      ]}
    />
  );
}

export function DataTabs() {
  return (
    <LinkTabs
      label="Data sections"
      tabs={[
        { href: "/admin/data", label: "Backups" },
        { href: "/admin/data/market", label: "Market data" },
        { href: "/admin/data/storage", label: "Storage" },
        { href: "/admin/data/presets", label: "Data packs" },
      ]}
    />
  );
}
