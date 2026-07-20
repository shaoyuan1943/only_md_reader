import assert from "node:assert/strict";
import test from "node:test";
import {
  addReaderNotification,
  type ReaderNotification,
} from "./reader-notifications.ts";

function error(id: string): ReaderNotification {
  return {
    id,
    kind: "error",
    title: "PDF导出失败！",
    detail: id,
    isClosing: false,
  };
}

void test("preserves notification title and detail", () => {
  const notification = error("无法保存 PDF 文件：Access denied");
  const notifications = addReaderNotification([], notification);

  assert.deepEqual(notifications[0], notification);
});

void test("appends a new notification so the latest item is rendered at the bottom", () => {
  const notifications = addReaderNotification([error("first")], error("latest"));

  assert.deepEqual(
    notifications.map((notification) => notification.id),
    ["first", "latest"],
  );
});

void test("closes the oldest active error when a fourth error arrives", () => {
  const notifications = addReaderNotification(
    [error("first"), error("second"), error("third")],
    error("latest"),
  );

  assert.deepEqual(
    notifications.map(({ id, isClosing }) => ({ id, isClosing })),
    [
      { id: "first", isClosing: true },
      { id: "second", isClosing: false },
      { id: "third", isClosing: false },
      { id: "latest", isClosing: false },
    ],
  );
  assert.equal(
    notifications.filter(
      (notification) => notification.kind === "error" && !notification.isClosing,
    ).length,
    3,
  );
});

void test("does not evict errors for a success notification", () => {
  const notifications = addReaderNotification(
    [error("first"), error("second"), error("third")],
    {
      id: "success",
      kind: "success",
      title: "PDF文件已导出！",
      detail: "readme.pdf",
      isClosing: false,
    },
  );

  assert.deepEqual(
    notifications.map((notification) => notification.id),
    ["first", "second", "third", "success"],
  );
  assert.equal(
    notifications.every((notification) => !notification.isClosing),
    true,
  );
});
