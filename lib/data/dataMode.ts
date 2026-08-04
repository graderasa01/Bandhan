export type DataMode = "mock" | "api";

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_DATA_MODE === "api" ? "api" : "mock";
}
