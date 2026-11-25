import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AdminLocaleProvider,
  LocaleProvider,
  useLocale,
  useT,
} from "../src/i18n/client";
import { adminDictionaries, commonDictionaries } from "../src/i18n/messages";
import { resolveMessages } from "../src/i18n/template";

function Copy({ admin = false }: { admin?: boolean }) {
  const t = useT();
  return (
    <span>
      {useLocale()}:{t.common.actions.save}:
      {admin ? t.admin.overview.nothingNeedsAttention : ""}
      <small>{t.portfolio.consolidated.holdingsCount(3)}</small>
    </span>
  );
}

test("locale entries preserve English fallback, Chinese functions, and nested admin copy", () => {
  expect(renderToStaticMarkup(<Copy />)).toContain("en:Save:");
  expect(
    renderToStaticMarkup(
      <LocaleProvider locale="en" messages={commonDictionaries.en}>
        <Copy />
      </LocaleProvider>,
    ),
  ).toContain("en:Save:");
  expect(
    renderToStaticMarkup(
      <LocaleProvider
        locale="zh"
        messages={structuredClone(commonDictionaries.zh)}
      >
        <Copy />
      </LocaleProvider>,
    ),
  ).toContain("zh:保存:");
  const html = renderToStaticMarkup(
    <LocaleProvider
      locale="zh"
      messages={structuredClone(commonDictionaries.zh)}
    >
      <AdminLocaleProvider messages={structuredClone(adminDictionaries.zh)}>
        <Copy admin />
      </AdminLocaleProvider>
    </LocaleProvider>,
  );
  expect(html).toContain(
    `zh:保存:${adminDictionaries.zh.admin.overview.nothingNeedsAttention}`,
  );
  expect(html).toContain("持仓 · 3");
  expect(html).not.toContain(
    adminDictionaries.en.admin.overview.nothingNeedsAttention,
  );
});

test("serialized templates preserve counts, plurals, and optional values", () => {
  const en = resolveMessages(structuredClone(commonDictionaries.en));
  expect(
    en.imports.importReview.saved({
      transactions: 2,
      holdings: 0,
      activity: 1,
      balances: 0,
      duplicates: 3,
    }),
  ).toBe(
    "Saved 2 transactions, 1 trades and payments. 3 already recorded were left out.",
  );
  expect(en.imports.importReview.duplicates(1)).toContain("duplicate needs");
  expect(en.imports.importReview.duplicates(2)).toContain("duplicates need");
  expect(en.spending.transferReview.linked(2)).not.toContain("+");
  expect(en.spending.transferReview.linked(2, true)).toContain("+");
});
