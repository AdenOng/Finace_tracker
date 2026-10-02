import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel, Output } from "ai";

import {
  type LlmAdapter,
  LlmError,
  type LlmProviderConfig,
  type ModelInfo,
  type StructuredRequest,
  type StructuredResult,
} from "../types";

/**
 * Direct HTTP providers via the Vercel AI SDK. Covers any OpenAI-compatible endpoint (OpenAI,
 * DeepSeek, OpenRouter, Ollama, LM Studio, opencode Zen…) and Anthropic-compatible endpoints.
 */
function createAiSdkAdapter(
  config: LlmProviderConfig,
  resolveModel: (id: string) => LanguageModel,
  listModels: () => Promise<ModelInfo[]>,
): LlmAdapter {
  return {
    async generateStructured<T>(
      request: StructuredRequest<T>,
    ): Promise<StructuredResult<T>> {
      const modelId = request.model ?? config.defaultModel;
      try {
        const result = await generateText({
          model: resolveModel(modelId),
          system: request.system,
          output: Output.object({
            schema: request.schema,
            name: request.schemaName,
          }),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: request.prompt },
                ...(request.files ?? []).map((file) => ({
                  type: "file" as const,
                  data: file.data,
                  mediaType: file.mediaType,
                  filename: file.filename,
                })),
              ],
            },
          ],
          abortSignal: request.signal,
          maxRetries: 2,
        });
        return {
          output: result.output,
          model: modelId,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        };
      } catch (error) {
        throw new LlmError(
          "The AI provider could not complete the request. Check its model and credentials.",
          error,
        );
      }
    },
    listModels,
  };
}

async function fetchModelList(
  url: string,
  headers: Record<string, string>,
): Promise<ModelInfo[]> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new LlmError(`Model list failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: { id: string; display_name?: string; name?: string }[];
  };
  return (body.data ?? []).map((m) => ({
    id: m.id,
    name: m.display_name ?? m.name ?? m.id,
  }));
}

export function createOpenAICompatibleAdapter(
  config: LlmProviderConfig,
): LlmAdapter {
  if (!config.baseUrl) throw new LlmError("Base URL is required");
  const baseURL = config.baseUrl.replace(/\/$/, "");
  const provider = createOpenAICompatible({
    name: "custom",
    baseURL,
    apiKey: config.apiKey ?? undefined,
    supportsStructuredOutputs: true,
  });
  return createAiSdkAdapter(
    config,
    (id) => provider(id),
    () =>
      fetchModelList(
        `${baseURL}/models`,
        config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      ),
  );
}

export function createAnthropicAdapter(config: LlmProviderConfig): LlmAdapter {
  const baseURL = (config.baseUrl ?? "https://api.anthropic.com/v1").replace(
    /\/$/,
    "",
  );
  const provider = createAnthropic({
    baseURL,
    apiKey: config.apiKey ?? undefined,
  });
  return createAiSdkAdapter(
    config,
    (id) => provider(id),
    () =>
      fetchModelList(`${baseURL}/models`, {
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      }),
  );
}
