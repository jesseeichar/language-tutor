/**
 * Preload for client tests (bun run test:ui): gives React a DOM via happy-dom
 * and unmounts rendered components after each test.
 * Not used for server tests, because happy-dom replaces fetch and Response.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

GlobalRegistrator.register({ url: "http://localhost:5173/" });

const { cleanup } = await import("@testing-library/react");
afterEach(() => {
  cleanup();
  localStorage.clear();
});
