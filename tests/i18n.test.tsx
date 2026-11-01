import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { useLocale, useT } from "../src/i18n/client";
import EnglishProvider from "../src/i18n/providers/en";
import ChineseProvider from "../src/i18n/providers/zh";
import ChineseAdminProvider from "../src/i18n/providers/admin-zh";
import englishAdmin from "../src/i18n/messages/en/admin";
import chineseAdmin from "../src/i18n/messages/zh/admin";

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
      <EnglishProvider>
        <Copy />
      </EnglishProvider>,
    ),
  ).toContain("en:Save:");
  expect(
    renderToStaticMarkup(
      <ChineseProvider>
        <Copy />
      </ChineseProvider>,
    ),
  ).toContain("zh:保存:");
  const html = renderToStaticMarkup(
    <ChineseProvider>
      <ChineseAdminProvider>
        <Copy admin />
      </ChineseAdminProvider>
    </ChineseProvider>,
  );
  expect(html).toContain(
    `zh:保存:${chineseAdmin.overview.nothingNeedsAttention}`,
  );
  expect(html).toContain("持仓 · 3");
  expect(html).not.toContain(englishAdmin.overview.nothingNeedsAttention);
});
