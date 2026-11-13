// Runs before every test file.
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests so one test cannot leak into the next.
afterEach(() => {
  cleanup();
});

// findBy and waitFor wait 1 s by default. That is plenty on an idle machine, but a screen that loads data and then
// re-renders can need longer when the machine is busy with other programs. A real failure still fails, only later.
configure({ asyncUtilTimeout: 5000 });
