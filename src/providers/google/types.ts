interface Blob {
  mimeType: string;
  data: string; // base64-encoded string
}

export interface FunctionCall {
  name: string;
  args?: { [key: string]: any };
}

interface FunctionResponse {
  name: string;
  response: { [key: string]: any };
}

interface FileData {
  mimeType?: string;
  fileUri: string;
}

export interface Part {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

export interface Content {
  parts: Part[];
  role?: string;
}

export interface Schema {
  type: 'TYPE_UNSPECIFIED' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: string;
  minItems?: string;
  properties?: { [key: string]: Schema };
  required?: string[];
  propertyOrdering?: string[];
  items?: Schema;
}

type SchemaType = Schema['type']; // Create a type alias for convenience

export const VALID_SCHEMA_TYPES: ReadonlyArray<SchemaType> = [
  'TYPE_UNSPECIFIED',
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT'
];

interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Schema;
  response?: Schema;
}

export type FunctionParameters = Record<string, unknown>;

interface GoogleSearchRetrieval {
  dynamicRetrievalConfig: {
    mode?: 'MODE_UNSPECIFIED' | 'MODE_DYNAMIC';
    dynamicThreshold?: number;
  };
}

export interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  googleSearchRetrieval?: GoogleSearchRetrieval;
  codeExecution?: object;
  googleSearch?: object;
}

export interface CompletionOptions {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  region?: string;
  publisher?: string;
  apiVersion?: string;
  anthropicVersion?: string;
  anthropic_version?: string; // Alternative format

  // https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent#request-body
  context?: string;
  examples?: { input: string; output: string }[];
  safetySettings?: { category: string; probability: string }[];
  stopSequences?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  max_tokens?: number; // Alternative format for Claude models
  topP?: number;
  top_p?: number; // Alternative format for Claude models
  topK?: number;
  top_k?: number; // Alternative format for Claude models

  // Live API websocket timeout
  timeoutMs?: number;

  generationConfig?: {
    context?: string;
    examples?: { input: string; output: string }[];
    stopSequences?: string[];
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;

    // AI Studio
    response_mime_type?: string;
    response_schema?: string;

    // Live API
    response_modalities?: string[];
  };

  responseSchema?: string;

  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'MODE_UNSPECIFIED' | 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };

  tools?: Tool[];

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<string, (arg: string) => Promise<any>>;

  /**
   * If set, spawn a python process with the file and connect to its API
   * for function tool calls at the specified URL.
   */
  functionToolStatefulApi?: {
    url: string;
    file?: string;
    pythonExecutable?: string;
  };

  systemInstruction?: Content;

  /**
   * Model-specific configuration for Llama models
   */
  llamaConfig?: {
    safetySettings?: {
      enabled?: boolean;
      llama_guard_settings?: Record<string, unknown>;
    };
  };
}

// Claude API interfaces
interface ClaudeMessage {
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface ClaudeRequest {
  anthropic_version: string;
  stream: boolean;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  messages: ClaudeMessage[];
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
  };
}
