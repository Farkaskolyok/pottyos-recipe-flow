import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom gaps used by Radix / our UI
if (!("ResizeObserver" in globalThis))
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
