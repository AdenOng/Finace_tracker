"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { categoryLabel, useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Field, Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { api } from "~/trpc/react";

export function WorkspacesView() {
  const t = useT();
  const router = useRouter();
  const utils = api.useUtils();
  const list = api.workspaces.list.useQuery();
  const currencies = api.catalog.currencies.useQuery();
  const [error, setError] = useState<string | null>(null);
  const create = api.workspaces.create.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: async ({ id }) => {
      await utils.workspaces.list.invalidate();
      router.push(`/workspaces/${id}`);
    },
  });

  return (
    <div className="space-y-12">
      <Section
        title={t.workspaces.workspacesView.yourWorkspaces}
        description={
          t.workspaces.workspacesView.eachWorkspaceIsASeparateAudienceOnly
        }
      >
        {list.error ? (
          <Notice tone="error">{list.error.message}</Notice>
        ) : !list.data ? (
          <p>{t.workspaces.workspacesView.loadingWorkspaces}</p>
        ) : list.data.length === 0 ? (
          <EmptyState title={t.workspaces.workspacesView.noWorkspacesYet}>
            {t.workspaces.workspacesView.createAFamilyWorkspaceOrAShared}
          </EmptyState>
        ) : (
          <ul className="divide-line divide-y">
            {list.data.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-4">
                <Link
                  className="font-semibold underline underline-offset-4"
                  href={`/workspaces/${w.id}`}
                >
                  {w.name}
                </Link>
                <Tag>{t.workspaces.kinds[w.kind]}</Tag>
                <Tag tone="outline">{t.workspaces.roles[w.role]}</Tag>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section
        title={t.workspaces.workspacesView.createWorkspace}
        description={
          t.workspaces.workspacesView.accountsStayPrivateUntilYouShareThem
        }
      >
        <form
          className="max-w-md space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const form = new FormData(e.currentTarget);
            create.mutate({
              name: formText(form, "name"),
              kind: formText(form, "kind") as "family" | "fund" | "custom",
              displayCurrency: formText(form, "currency"),
            });
          }}
        >
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field
            label={t.workspaces.workspacesView.workspaceName}
            htmlFor="workspace-name"
          >
            <Input id="workspace-name" name="name" maxLength={120} required />
          </Field>
          <Field
            label={t.workspaces.workspacesView.purpose}
            htmlFor="workspace-kind"
          >
            <Select id="workspace-kind" name="kind">
              <option value="family">
                {t.workspaces.workspacesView.family}
              </option>
              <option value="fund">{t.workspaces.workspacesView.fund}</option>
              <option value="custom">
                {t.workspaces.workspacesView.other}
              </option>
            </Select>
          </Field>
          <Field
            label={t.workspaces.workspacesView.displayCurrency}
            htmlFor="workspace-currency"
          >
            <Select
              id="workspace-currency"
              name="currency"
              defaultValue="SGD"
              required
            >
              {(currencies.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {categoryLabel(t, c.name)}
                </option>
              ))}
            </Select>
          </Field>
          {currencies.error ? (
            <Notice tone="error">{currencies.error.message}</Notice>
          ) : null}
          <Button
            type="submit"
            loading={create.isPending}
            disabled={!currencies.data?.length || create.isPending}
          >
            {t.workspaces.workspacesView.createWorkspace}
          </Button>
        </form>
      </Section>
    </div>
  );
}
