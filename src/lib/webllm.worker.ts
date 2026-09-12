import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();

globalThis.addEventListener("message", (event) => {
  handler.onmessage(event);
});
