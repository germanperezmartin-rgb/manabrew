import { invoke } from "@tauri-apps/api/core";
import type { ScryfallCard } from "@/types/scryfall";
import { getPlatformType } from "@/platform";

export interface ArcanaCatalogStats {
  printings: number;
  uniqueCards: number;
  source: string;
  importedAt: string;
}

export interface ArcanaImportProgress {
  processed: number;
  imported: number;
  ignored: number;
}

export interface ArcanaCatalogPage {
  total: number;
  page: number;
  pageSize: number;
  cards: ScryfallCard[];
}

const EMPTY_STATS: ArcanaCatalogStats = {
  printings: 0,
  uniqueCards: 0,
  source: "",
  importedAt: "",
};

export function arcanaCatalogIsDesktop(): boolean {
  return getPlatformType() === "tauri";
}

export async function arcanaCatalogStats(): Promise<ArcanaCatalogStats> {
  if (!arcanaCatalogIsDesktop()) return EMPTY_STATS;
  return invoke<ArcanaCatalogStats>("arcana_catalog_stats");
}

/** Opens the native file chooser; cancellation resolves to null. */
export async function arcanaImportScryfall(): Promise<ArcanaCatalogStats | null> {
  if (!arcanaCatalogIsDesktop()) {
    throw new Error("El importador está disponible en la aplicación de escritorio.");
  }
  return invoke<ArcanaCatalogStats | null>("arcana_import_scryfall");
}

export async function arcanaCatalogSearch(query: string, page = 1): Promise<ArcanaCatalogPage> {
  if (!arcanaCatalogIsDesktop()) return { total: 0, page, pageSize: 36, cards: [] };
  return invoke<ArcanaCatalogPage>("arcana_catalog_search", { query, page });
}

export async function arcanaCatalogPrintings(
  oracleId: string,
  page = 1,
): Promise<ArcanaCatalogPage> {
  if (!arcanaCatalogIsDesktop()) return { total: 0, page, pageSize: 30, cards: [] };
  return invoke<ArcanaCatalogPage>("arcana_catalog_printings", { oracleId, page });
}

export async function arcanaCatalogLookup({
  name,
  setCode,
  collectorNumber,
  id,
}: {
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  id?: string;
}): Promise<ScryfallCard | null> {
  if (!arcanaCatalogIsDesktop()) return null;
  return invoke<ScryfallCard | null>("arcana_catalog_lookup", {
    name: name ?? null,
    setCode: setCode ?? null,
    collectorNumber: collectorNumber ?? null,
    id: id ?? null,
  });
}
