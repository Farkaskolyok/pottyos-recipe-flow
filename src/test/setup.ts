import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom gaps used by Radix / our UI
if (!("ResizeObserver" in globalThis))
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

// Use Node's native Blob/File so IndexedDB (fake-indexeddb, structured clone) keeps real Blobs.
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
(globalThis as unknown as { Blob: unknown }).Blob = NodeBlob;
(globalThis as unknown as { File: unknown }).File = NodeFile;
