import { LlmError } from "./types";

/** Provider SDK errors can contain keys, prompts and statement data. Never send their details. */
export function describeLlmError(error: unknown): string {
  return error instanceof LlmError
    ? error.message
    : "The AI request failed. Check the provider configuration and try again.";
}
