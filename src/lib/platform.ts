/** The desktop build embeds the frontend and has no HTTP app server. */
export const isDesktop = () => import.meta.env.VITE_DESKTOP === "1";
export const AI_UNAVAILABLE_MESSAGE = "Az AI szolgáltatás nincs implementálva";

/** Returns false if the Windows save dialog was cancelled. */
export async function saveDownload(blob: Blob, name: string): Promise<boolean> {
  if (isDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("save_document", {
      name,
      data: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export async function openDesktopSource(blob: Blob, name: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  // Demo specifications are text placeholders, not actual PDF/Word files.
  const filename = blob.type.startsWith("text/plain") ? `${name}.txt` : name;
  await invoke("open_source_file", {
    name: filename,
    data: Array.from(new Uint8Array(await blob.arrayBuffer())),
  });
}
