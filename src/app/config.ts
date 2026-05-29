import type { AppMode } from "./appMode";

function readMode(): AppMode {
  const raw = new URLSearchParams(window.location.search).get("mode");
  return raw === "local-edit" ? "local-edit" : "readonly-pages";
}

export const appConfig = {
  mode: readMode(),
};
