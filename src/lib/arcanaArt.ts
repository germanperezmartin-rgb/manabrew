import { invoke } from "@tauri-apps/api/core";

export interface ArcanaArtLibraryStatus {
  running: boolean;
  phase: string;
  variants: string[];
  total: number;
  done: number;
  downloaded: number;
  alreadyCached: number;
  failed: number;
  bytes: number;
  cancelled: boolean;
  error: string | null;
}

export type ArcanaArtQuality = "normal" | "play" | "complete";

export function arcanaArtVariants(quality: ArcanaArtQuality): string[] {
  switch (quality) {
    case "normal":
      return ["normal"];
    case "play":
      return ["normal", "border_crop", "art_crop"];
    case "complete":
      return ["normal", "border_crop", "art_crop", "large"];
  }
}

/** Uses the already imported SQLite catalog; it NEVER uploads the database. */
export function arcanaArtDownload(quality: ArcanaArtQuality): Promise<ArcanaArtLibraryStatus> {
  return invoke<ArcanaArtLibraryStatus>("arcana_art_download", {
    variants: arcanaArtVariants(quality),
  });
}

export function arcanaArtStatus(): Promise<ArcanaArtLibraryStatus> {
  return invoke<ArcanaArtLibraryStatus>("arcana_art_status");
}

export function arcanaArtCancel(): Promise<void> {
  return invoke<void>("arcana_art_cancel");
}

export function arcanaArtOpenFolder(): Promise<void> {
  return invoke<void>("arcana_art_open_folder");
}

export function arcanaArtEstimateGiB(printings: number, quality: ArcanaArtQuality): number {
  const typicalKb = quality === "normal" ? 113 : quality === "play" ? 291 : 541;
  return Math.ceil((printings * typicalKb) / (1024 * 1024));
}
