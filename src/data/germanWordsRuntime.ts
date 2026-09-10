import { isGermanWordRecord } from "./germanWordsCore";
import type { GermanWordRecord } from "./germanWordsCore";

let databasePromise: Promise<GermanWordRecord[]> | null = null;

export function loadGermanWordDatabase(): Promise<GermanWordRecord[]> {
  databasePromise ??= import("./germanWords.generated.json").then(({ default: generatedWords }) => (
    (generatedWords as unknown as unknown[]).filter(isGermanWordRecord)
  ));
  return databasePromise;
}
