import assert from "node:assert/strict";
import test from "node:test";

function installWindow(url: string) {
  const events: string[] = [];
  const location = new URL(url);
  const fakeWindow: any = {
    location: {
      get href() {
        return location.href;
      },
      set href(next: string) {
        const resolved = new URL(next, location.href);
        location.href = resolved.href;
      },
      get search() {
        return location.search;
      },
      set search(next: string) {
        location.search = next;
      },
    },
    history: {
      pushState(_: unknown, __: string, nextUrl: string) {
        const resolved = new URL(nextUrl, location.href);
        location.href = resolved.href;
      },
    },
    dispatchEvent(event: Event) {
      events.push(event.type);
      return true;
    },
  };

  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const previousPopStateEvent = globalThis.PopStateEvent;
  class FakePopStateEvent extends Event {
    constructor(type: string) {
      super(type);
    }
  }
  (globalThis as typeof globalThis & { window?: unknown }).window = fakeWindow;
  globalThis.PopStateEvent = FakePopStateEvent as unknown as typeof PopStateEvent;

  return {
    fakeWindow,
    events,
    restore() {
      (globalThis as typeof globalThis & { window?: unknown }).window = previousWindow;
      globalThis.PopStateEvent = previousPopStateEvent;
    },
  };
}

test("readRouteState parses note routes and navigation updates the URL", async () => {
  const { events, restore } = installWindow("http://example.test/?mode=local-edit");
  try {
    const router = await import("../src/app/router");
    assert.deepEqual(router.readRouteState(), { kind: "home" });

    router.navigateToNote("subject-a", "note-a");
    assert.deepEqual(router.readRouteState(), { kind: "note", subjectId: "subject-a", noteId: "note-a" });
    assert.deepEqual(events, ["popstate"]);

    router.navigateHome();
    assert.deepEqual(router.readRouteState(), { kind: "home" });
    assert.deepEqual(events, ["popstate", "popstate"]);
  } finally {
    restore();
  }
});
