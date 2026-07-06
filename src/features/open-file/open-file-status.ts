export type OpenFileStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function getVisibleOpenFileStatusMessage(state: OpenFileStatus): string | null {
  if (state.status !== "error") {
    return null;
  }

  return state.message;
}
