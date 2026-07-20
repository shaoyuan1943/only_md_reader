export const MAX_VISIBLE_ERROR_NOTIFICATIONS = 3;

export type ReaderNotification = {
  detail: string;
  id: string;
  isClosing: boolean;
  kind: "error" | "success";
  title: string;
};

export function addReaderNotification(
  notifications: ReaderNotification[],
  notification: ReaderNotification,
): ReaderNotification[] {
  if (notification.kind !== "error") {
    return [...notifications, notification];
  }

  const activeErrors = notifications.filter(
    (current) => current.kind === "error" && !current.isClosing,
  );

  if (activeErrors.length < MAX_VISIBLE_ERROR_NOTIFICATIONS) {
    return [...notifications, notification];
  }

  const oldestErrorId = activeErrors[0]?.id;

  return [
    ...notifications.map((current) =>
      current.id === oldestErrorId ? { ...current, isClosing: true } : current,
    ),
    notification,
  ];
}

export function closeReaderNotification(
  notifications: ReaderNotification[],
  id: string,
): ReaderNotification[] {
  return notifications.map((notification) =>
    notification.id === id ? { ...notification, isClosing: true } : notification,
  );
}

export function removeReaderNotification(
  notifications: ReaderNotification[],
  id: string,
): ReaderNotification[] {
  return notifications.filter((notification) => notification.id !== id);
}
