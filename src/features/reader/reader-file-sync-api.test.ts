import assert from "node:assert/strict";
import test from "node:test";
import {
  createTauriReaderFileSyncApiForWindow,
  type ReaderFileChangedEvent,
} from "./reader-file-sync-api.ts";

void test("subscribes to file changes on the current reader window target", async () => {
  let subscribedEvent = "";
  const registration: {
    listener?: (event: { payload: ReaderFileChangedEvent }) => void;
  } = {};
  const api = createTauriReaderFileSyncApiForWindow({
    listen(event, listener) {
      subscribedEvent = event;
      registration.listener = listener as typeof registration.listener;
      return Promise.resolve(() => undefined);
    },
  });
  const events: ReaderFileChangedEvent[] = [];

  await api.listen((event) => events.push(event));
  if (!registration.listener) {
    throw new Error("Expected the current window to register a listener");
  }
  registration.listener({
    payload: {
      path: "C:\\notes\\watch.md",
      revision: 1,
      status: "changed",
    },
  });

  assert.equal(subscribedEvent, "reader:file-changed");
  assert.deepEqual(events, [
    { path: "C:\\notes\\watch.md", revision: 1, status: "changed" },
  ]);
});
