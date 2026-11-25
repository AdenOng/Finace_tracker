import { type RouterOutputs } from "~/trpc/react";

export type Provider = RouterOutputs["admin"]["ai"]["list"][number];

export type Kind = Provider["kind"];
