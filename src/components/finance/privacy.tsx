"use client";

import { Eye, EyeOff } from "lucide-react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "~/components/ui/button";
import type { AmountScope } from "~/lib/privacy";
import { api } from "~/trpc/react";

/*
 * Hiding amounts: anything marked `sensitive` is masked by CSS (see globals.css) when the app
 * root or its card says so. Nothing re-renders or refetches, so switching is instant, and
 * server components only need the class name.
 */

type Prefs = { hidden: boolean; scopes: Record<string, boolean> };
type Card = { scope: AmountScope; entity?: string };

/** One account or workspace gets its own key, so showing it never shows another. */
const keyOf = ({ scope, entity }: Card) =>
  entity ? `${scope}:${entity}` : scope;

// Outside the app shell (tests, isolated renders) amounts are shown and the toggles do nothing.
const PrefsContext = createContext<{
  prefs: Prefs;
  unsaved: boolean;
  setHidden: (hidden: boolean) => void;
  setCard: (card: Card, hidden: boolean) => void;
}>({
  prefs: { hidden: false, scopes: {} },
  unsaved: false,
  setHidden: () => undefined,
  setCard: () => undefined,
});
const CardContext = createContext<Card | null>(null);

const usePrefs = () => useContext(PrefsContext);

export function AmountsProvider({
  initial,
  children,
}: {
  initial: Prefs;
  children: ReactNode;
}) {
  const [prefs, setPrefs] = useState(initial);
  // A failed save keeps what is on screen (never un-masking it) and says it wasn't saved.
  const [unsaved, setUnsaved] = useState(false);
  const saveHidden = api.settings.setHideAmounts.useMutation();
  const saveScope = api.settings.setAmountScope.useMutation();
  // Saves run one at a time, in click order, so the last choice is the one stored.
  const queue = useRef<Promise<void>>(Promise.resolve());
  function save(run: () => Promise<unknown>, resetsAll = false) {
    queue.current = queue.current.then(run).then(
      // Saving the main switch rewrites every card, so earlier failures no longer matter.
      () => (resetsAll ? setUnsaved(false) : undefined),
      () => setUnsaved(true),
    );
  }

  function setHidden(hidden: boolean) {
    // The main switch is the quick way to cover everything, so it resets every card.
    setPrefs({ hidden, scopes: {} });
    save(() => saveHidden.mutateAsync({ hide: hidden }), true);
  }
  function setCard(card: Card, hidden: boolean) {
    setPrefs((current) => {
      const scopes = { ...current.scopes };
      if (hidden === current.hidden) delete scopes[keyOf(card)];
      else scopes[keyOf(card)] = hidden;
      return { ...current, scopes };
    });
    // Cards for one account or workspace last until reload rather than piling up in settings.
    if (!card.entity)
      save(() => saveScope.mutateAsync({ scope: card.scope, hidden }));
  }

  return (
    <PrefsContext.Provider value={{ prefs, unsaved, setHidden, setCard }}>
      {children}
    </PrefsContext.Provider>
  );
}

/** The main "Hide amounts" setting, for Settings and the app menu. */
export function useHideAmounts() {
  const { prefs, unsaved, setHidden } = usePrefs();
  return [prefs.hidden, setHidden, unsaved] as const;
}

/**
 * A card whose amounts can be shown or hidden apart from the main setting. Pass `entity` (an
 * account or workspace id) when the same card appears once per record.
 */
export function AmountsScope({
  scope,
  entity,
  as: Tag = "section",
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  scope: AmountScope;
  entity?: string;
  as?: "section" | "div";
}) {
  const { prefs } = usePrefs();
  const card = { scope, entity };
  const hidden = prefs.scopes[keyOf(card)] ?? prefs.hidden;
  return (
    <CardContext.Provider value={card}>
      <Tag {...props} data-amounts-scope={hidden ? "hidden" : "shown"}>
        {children}
      </Tag>
    </CardContext.Provider>
  );
}

/** Eye button for the surrounding card, or for the whole app when `global` is set. */
export function AmountsToggle({
  global = false,
  className,
}: {
  global?: boolean;
  className?: string;
}) {
  const { prefs, unsaved, setHidden, setCard } = usePrefs();
  const card = useContext(CardContext);
  const own = global ? null : card;
  const hidden = own
    ? (prefs.scopes[keyOf(own)] ?? prefs.hidden)
    : prefs.hidden;
  const label = `${hidden ? "Show" : "Hide"} ${own ? "amounts in this card" : "all amounts"}${unsaved ? " (couldn't save; applies until you reload)" : ""}`;
  const Icon = hidden ? EyeOff : Eye;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className ?? "min-h-11 min-w-11"}
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      onClick={() => (own ? setCard(own, !hidden) : setHidden(!hidden))}
    >
      <Icon
        aria-hidden="true"
        className={unsaved ? "text-warn size-4" : "size-4"}
      />
    </Button>
  );
}
