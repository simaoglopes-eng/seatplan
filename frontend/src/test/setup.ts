// Runs before every test file.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests so one test cannot leak into the next.
afterEach(() => {
  cleanup();
});
