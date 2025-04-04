interface Model {
  displayName: string;
  apiName: string;
}

export const models: Model[] = [
  { displayName: "Gemini 2.5 Pro", apiName: "gemini-2.5-pro-preview-03-25" },
  { displayName: "Gemini 2.0 Flash", apiName: "gemini-2.0-flash" },
  { displayName: "Gemini 2.0 Flash Lite", apiName: "gemini-2.0-flash-lite" },
];
