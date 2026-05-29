export type RouteState =
  | { kind: "home" }
  | { kind: "note"; subjectId: string; noteId: string };

function nextUrlWithParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function readRouteState(): RouteState {
  const search = new URLSearchParams(window.location.search);
  const subjectId = search.get("subjectId");
  const noteId = search.get("noteId");
  if (subjectId && noteId) return { kind: "note", subjectId, noteId };
  return { kind: "home" };
}

export function navigateToNote(subjectId: string, noteId: string) {
  window.history.pushState({}, "", nextUrlWithParams({ subjectId, noteId }));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateHome() {
  window.history.pushState({}, "", nextUrlWithParams({ subjectId: null, noteId: null }));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
