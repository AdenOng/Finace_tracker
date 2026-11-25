"use client";

import { useT, categoryLabel } from "~/i18n/client";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Tag } from "~/components/ui/panel";
import { cn } from "~/lib/cn";
import type { Category } from "./category-drawers";

export function SortableList<T extends { id: string; name: string }>({
  items,
  render,
  onMove,
  disabled,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  return (
    <ul>
      {items.map((item, index) => (
        <li
          key={item.id}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(index);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) onMove(dragIndex, index);
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={cn(
            "border-line flex items-start gap-1 border-b last:border-b-0",
            dragIndex === index && "opacity-40",
            overIndex === index &&
              dragIndex !== null &&
              dragIndex !== index &&
              (dragIndex < index
                ? "shadow-[inset_0_-2px_0_var(--color-brand)]"
                : "shadow-[inset_0_2px_0_var(--color-brand)]"),
          )}
        >
          {disabled ? null : (
            <button
              type="button"
              draggable
              aria-label={t.adminManage.categories.reorderLabel(item.name)}
              title={t.adminManage.categories.dragToReorder}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  onMove(index, index + (e.key === "ArrowUp" ? -1 : 1));
                }
              }}
              className="text-ink-3 hover:text-ink rounded-ctl mt-2 grid size-7 shrink-0 cursor-grab place-items-center active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">{render(item)}</div>
        </li>
      ))}
    </ul>
  );
}

export function CategoryRow({
  category,
  child,
  fallbackColor,
  onEdit,
  onArchive,
}: {
  category: Category;
  child?: boolean;
  fallbackColor?: string | null;
  onEdit: (c: Category) => void;
  onArchive: (c: Category, mode: "archive" | "merge") => void;
}) {
  const t = useT();
  const count = t.adminManage.categories.transactionCount(
    category.transactionCount,
  );
  return (
    <div className={cn("flex items-center gap-3 py-2.5", child ? "pl-2" : "")}>
      <span
        className={cn(
          "shrink-0 rounded-[3px]",
          child ? "size-2.5" : "size-3.5",
        )}
        style={{
          background: category.color ?? fallbackColor ?? "#9aa3a0",
          opacity: child && !category.color ? 0.55 : 1,
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", child ? "font-medium" : "font-bold")}>
          {categoryLabel(t, category.name)}
          {!category.isSystem ? (
            <Tag tone="outline" className="ml-2">
              {t.adminManage.categories.custom}
            </Tag>
          ) : null}
          <span className="figures text-ink-3 ml-2 text-[12px] font-normal sm:hidden">
            {count}
          </span>
        </p>
        {category.aiHint ? (
          <p className="text-ink-3 truncate text-[13px]">{category.aiHint}</p>
        ) : null}
      </div>
      <span className="figures text-ink-3 hidden text-[13px] whitespace-nowrap sm:block">
        {count}
      </span>
      <div className="flex shrink-0 gap-0.5">
        <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
          {t.common.actions.edit}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-ink-2"
          onClick={() => onArchive(category, "merge")}
        >
          {t.adminManage.categories.merge}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-loss"
          onClick={() => onArchive(category, "archive")}
        >
          {t.common.actions.archive}
        </Button>
      </div>
    </div>
  );
}
