import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  GuardrailResponse,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';
import { getNunjucksEngine } from '../../util/templates';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { CHAT_MODELS } from './shared';
import type { CompletionOptions } from './types';
import { loadFile, stringifyCandidateContents, geminiFormatAndSystemInstructions } from './util';
import type { GeminiResponseData } from './util';

const DEFAULT_API_HOST = 'generativelanguage.googleapis.com';

class AIStudioGenericProvider implements ApiProvider {
  modelName: string;

  config: CompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `google:${this.modelName}`;
  }

  toString(): string {
    return `[Google AI Studio Provider ${this.modelName}]`;
  }

  getApiHost(): string | undefined {
    const apiHost =
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST') ||
      DEFAULT_API_HOST;
    if (apiHost) {
      return getNunjucksEngine().renderString(apiHost, {});
    }
    return undefined;
  }

  getApiKey(): string | undefined {
    const apiKey =
      this.config.apiKey ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.PALM_API_KEY ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('PALM_API_KEY');
    if (apiKey) {
      return getNunjucksEngine().renderString(apiKey, {});
    }
    return undefined;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class AIStudioChatProvider extends AIStudioGenericProvider {
  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!CHAT_MODELS.includes(modelName)) {
      logger.debug(`Using unknown Google chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const isGemini = this.modelName.startsWith('gemini');
    if (isGemini) {
      return this.callGemini(prompt, context);
    }

    // https://developers.generativeai.google/tutorials/curl_quickstart
    // https://ai.google.dev/api/rest/v1beta/models/generateMessage
    const messages = parseChatPrompt(prompt, [{ content: prompt }]);
    const body = {
      prompt: { messages },
      temperature: this.config.temperature,
      topP: this.config.topP,
      topK: this.config.topK,
      safetySettings: this.config.safetySettings,
      stopSequences: this.config.stopSequences,
      maxOutputTokens: this.config.maxOutputTokens,
    };

    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1beta3/models/${
          this.modelName
        }:generateMessage?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);

    if (!data?.candidates || data.candidates.length === 0) {
      return {
        error: `API did not return any candidate responses: ${JSON.stringify(data)}`,
      };
    }

    try {
      const output = data.candidates[0].content;
      return {
        output,
        tokenUsage: cached
          ? {
              cached: data.usageMetadata?.totalTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 0,
            }
          : {
              prompt: data.usageMetadata?.promptTokenCount,
              completion: data.usageMetadata?.candidatesTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 1,
            },
        raw: data,
        cached,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  async callGemini(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      this.config.systemInstruction,
    );

    // Determine API version based on model
    const apiVersion = this.modelName === 'gemini-2.0-flash-thinking-exp' ? 'v1alpha' : 'v1beta';

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        ...(this.config.temperature !== undefined && { temperature: this.config.temperature }),
        ...(this.config.topP !== undefined && { topP: this.config.topP }),
        ...(this.config.topK !== undefined && { topK: this.config.topK }),
        ...(this.config.stopSequences !== undefined && {
          stopSequences: this.config.stopSequences,
        }),
        ...(this.config.maxOutputTokens !== undefined && {
          maxOutputTokens: this.config.maxOutputTokens,
        }),
        ...this.config.generationConfig,
      },
      safetySettings: this.config.safetySettings,
      ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
      ...(this.config.tools ? { tools: loadFile(this.config.tools, context?.vars) } : {}),
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    };

    if (this.config.responseSchema) {
      if (body.generationConfig.response_schema) {
        throw new Error(
          '`responseSchema` provided but `generationConfig.response_schema` already set.',
        );
      }

      const schema = maybeLoadFromExternalFile(
        renderVarsInObject(this.config.responseSchema, context?.vars),
      );

      body.generationConfig.response_schema = schema;
      body.generationConfig.response_mime_type = 'application/json';
    }

    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data;
    let cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.getApiHost()}/${apiVersion}/models/${
          this.modelName
        }:generateContent?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false,
      )) as {
        data: GeminiResponseData;
        cached: boolean;
      });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);

    if (!(data && data.candidates && data.candidates.length == 1)) {
      return {
        error: 'Expected one candidate in AIStudio API response.',
      };
    }

    const candidate = data.candidates[0];

    let output;
    if (candidate.content?.parts) {
      output = stringifyCandidateContents(candidate);
    }

    try {
      let guardrails: GuardrailResponse | undefined;

      if (data.promptFeedback?.safetyRatings || candidate.safetyRatings) {
        const flaggedInput = data.promptFeedback?.safetyRatings?.some(
          (r) => r.probability !== 'NEGLIGIBLE',
        );
        const flaggedOutput = candidate.safetyRatings?.some((r) => r.probability !== 'NEGLIGIBLE');
        const flagged = flaggedInput || flaggedOutput;

        guardrails = {
          flaggedInput,
          flaggedOutput,
          flagged,
        };
      }

      return {
        output,
        tokenUsage: cached
          ? {
              cached: data.usageMetadata?.totalTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 0,
            }
          : {
              prompt: data.usageMetadata?.promptTokenCount,
              completion: data.usageMetadata?.candidatesTokenCount,
              total: data.usageMetadata?.totalTokenCount,
              numRequests: 1,
            },
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
