"use client";

import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Notice } from "~/components/ui/panel";
import { api } from "~/trpc/react";

export function AcceptWorkspaceInvitation({ token }: { token: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const accept = api.workspaces.acceptInvitation.useMutation({
    onSuccess: async ({ workspaceId }) => {
      await utils.invalidate();
      router.replace(`/workspaces/${workspaceId}`);
      router.refresh();
    },
  });
  return (
    <div className="space-y-4">
      {accept.error ? (
        <Notice tone="error">{accept.error.message}</Notice>
      ) : null}
      <Button
        loading={accept.isPending}
        onClick={() => accept.mutate({ token })}
      >
        Join workspace
      </Button>
    </div>
  );
}
