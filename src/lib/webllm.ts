/**
 * Small, browser-local WebLLM adapter.
 *
 * The package is loaded lazily so a learner who keeps AI off does not pay the
 * WebGPU bundle cost. The model is cached by WebLLM after its first download.
 */

export const DEFAULT_WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export interface WebLlmProgressReport {
  progress: number;
  text: string;
}

type WebLlmProgressCallback = (report: WebLlmProgressReport) => void;

interface WebLlmEngine {
  chat: {
    completions: {
      create: (request: {
        messages: Array<{ role: "user"; content: string }>;
        temperature?: number;
        max_tokens?: number;
        response_format?: { type: "json_object" };
      }) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
  setInitProgressCallback?: (callback: (report: { progress: number; text: string }) => void) => void;
}

let enginePromise: Promise<WebLlmEngine> | null = null;
let activeProgressCallback: WebLlmProgressCallback | undefined;
let activeModelId = "";
let activeWorker: Worker | null = null;

export function supportsWebLlm(): boolean {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && "gpu" in navigator;
}

function normalizeProgress(report: { progress?: number; text?: string }): WebLlmProgressReport {
  return {
    progress: Math.max(0, Math.min(1, typeof report.progress === "number" ? report.progress : 0)),
    text: typeof report.text === "string" && report.text.trim() ? report.text.trim() : "Preparing the local model…",
  };
}

export async function prepareWebLlmModel(
  modelId = DEFAULT_WEBLLM_MODEL,
  onProgress?: WebLlmProgressCallback,
): Promise<WebLlmEngine> {
  if (!supportsWebLlm()) {
    throw new Error("This device does not expose WebGPU. Use the PC bridge or Ollama for local AI here.");
  }

  activeProgressCallback = onProgress;
  const requestedModelId = modelId.trim() || DEFAULT_WEBLLM_MODEL;
  if (enginePromise && activeModelId !== requestedModelId) {
    // This app exposes one tested low-resource model. Keep an accidental old
    // setting from routing a request to an incompatible cached engine.
    activeWorker?.terminate();
    activeWorker = null;
    enginePromise = null;
    activeModelId = "";
  }

  if (!enginePromise) {
    activeModelId = requestedModelId;
    enginePromise = import("@mlc-ai/web-llm").then(async ({ CreateMLCEngine, CreateWebWorkerMLCEngine }) => {
      const engineConfig = {
        initProgressCallback: (report: { progress: number; text: string }) => activeProgressCallback?.(normalizeProgress(report)),
      };
      if (typeof Worker === "function") {
        activeWorker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
        return await CreateWebWorkerMLCEngine(activeWorker, requestedModelId, engineConfig) as WebLlmEngine;
      }
      return await CreateMLCEngine(requestedModelId, engineConfig) as WebLlmEngine;
    });
  }

  try {
    const engine = await enginePromise;
    engine.setInitProgressCallback?.((report) => activeProgressCallback?.(normalizeProgress(report)));
    return engine;
  } catch (error) {
    activeWorker?.terminate();
    activeWorker = null;
    enginePromise = null;
    activeModelId = "";
    throw error;
  }
}

export async function runWebLlmJson(
  prompt: string,
  options: { model?: string; maxTokens?: number; onProgress?: WebLlmProgressCallback } = {},
): Promise<string> {
  const engine = await prepareWebLlmModel(options.model || DEFAULT_WEBLLM_MODEL, options.onProgress);
  const response = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: options.maxTokens ?? 1400,
    response_format: { type: "json_object" },
  });
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The on-device model returned an empty answer.");
  }
  return content;
}
