import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });
}
