import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { z } from "zod";

import {
  type LlmAdapter,
  LlmError,
  type LlmProviderConfig,
  type ModelInfo,
  type StructuredRequest,
  type StructuredResult,
} from "../types";

/**
 * Talks to a headless `opencode serve` instance, which handles provider auth (e.g. an opencode Go
 * subscription). Each request runs in a throwaway session with tools disabled, using opencode's
 * native JSON-schema structured output.
 *
 * Model ids are "providerID/modelID", e.g. "opencode-go/glm-5.3-flash".
 */
export function createOpencodeAdapter(config: LlmProviderConfig): LlmAdapter {
  const headers: Record<string, string> = {};
  if (config.basicAuth) {
    const token = Buffer.from(
      `${config.basicAuth.username}:${config.basicAuth.password}`,
    ).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }
  const client = createOpencodeClient({
    baseUrl: config.baseUrl ?? "http://localhost:4096",
    headers,
  });

  return {
    async generateStructured<T>(
      request: StructuredRequest<T>,
    ): Promise<StructuredResult<T>> {
      const modelRef = request.model ?? config.defaultModel;
      const [providerID, ...rest] = modelRef.split("/");
      const modelID = rest.join("/");
      if (!providerID || !modelID) {
        throw new LlmError('opencode model must look like "provider/model"');
      }

      const created = await client.session.create({
        title: `finfolio:${request.schemaName}`,
      });
      if (!created.data) {
        throw new LlmError("opencode: failed to create session", created.error);
      }
      const sessionID = created.data.id;

      try {
        const response = await client.session.prompt(
          {
            sessionID,
            model: { providerID, modelID },
            system: request.system,
            tools: { "*": false },
            format: {
              type: "json_schema",
              schema: z.toJSONSchema(request.schema, { target: "draft-7" }),
              retryCount: 2,
            },
            parts: [
              { type: "text", text: request.prompt },
              ...(request.files ?? []).map((file) => ({
                type: "file" as const,
                mime: file.mediaType,
                filename: file.filename,
                url: `data:${file.mediaType};base64,${Buffer.from(file.data).toString("base64")}`,
              })),
            ],
          },
          { signal: request.signal },
        );

        const info = response.data?.info;
        if (!info)
          throw new LlmError("opencode: empty response", response.error);
        if (info.error) {
          throw new LlmError(
            `opencode: ${info.error.name}`,
            "data" in info.error ? info.error.data : info.error,
          );
        }
        const parsed = request.schema.safeParse(info.structured);
        if (!parsed.success) {
          throw new LlmError("opencode: output failed validation", {
            issues: parsed.error.issues,
            output: info.structured,
          });
        }
        return {
          output: parsed.data,
          model: `${info.providerID}/${info.modelID}`,
          usage: {
            inputTokens: info.tokens.input,
            outputTokens: info.tokens.output,
          },
        };
      } finally {
        void client.session.delete({ sessionID }).catch(() => undefined);
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      const result = await client.config.providers();
      if (!result.data) {
        throw new LlmError("opencode: failed to list providers", result.error);
      }
      return result.data.providers.flatMap((provider) =>
        Object.values(provider.models).map((model) => ({
          id: `${provider.id}/${model.id}`,
          name: `${provider.name} · ${model.name}`,
          supportsAttachments: model.capabilities?.attachment,
        })),
      );
    },
  };
}
