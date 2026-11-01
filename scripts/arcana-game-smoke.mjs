import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const report = { stages: [], errors: [], status: "started", excerpt: "" };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => report.errors.push(err.message));
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("link", { name: /Singleplayer/i }).first().click({ timeout: 30000 });
  await page.getByText("Starter Decks", { exact: true }).waitFor({ timeout: 60000 });
  report.stages.push("Selector de mazos abierto");
  await page.screenshot({ path: "arcana-selector.png" });
  await page.getByRole("button", { name: "Pauper Mono Red Madness" }).click({ timeout: 30000 });
  report.stages.push("Mazo propio seleccionado");
  await page.getByRole("button", { name: "Pauper Mono White Weenie" }).click({ timeout: 30000 });
  report.stages.push("Mazo de la IA seleccionado");
  await page.getByRole("button", { name: "Fight!" }).click({ timeout: 30000 });
  await page.getByRole("dialog").getByRole("button", { name: "Fight", exact: true }).click({
    timeout: 30000,
  });
  report.stages.push("Partida solicitada a Forge");
  await page.screenshot({ path: "arcana-inicio-partida.png" });
  await page.waitForFunction(
    () => {
      const body = document.body?.innerText ?? "";
      const canvases = document.querySelectorAll("canvas").length;
      return (
        canvases > 0 &&
        !body.includes("Choose your deck") &&
        !body.includes("Starter Decks")
      );
    },
    { timeout: 180000 },
  );
  await page.waitForTimeout(5000);
  report.stages.push("Tablero de juego renderizado");
  report.excerpt = (await page.locator("body").innerText()).slice(0, 2500);
  await page.screenshot({ path: "arcana-tablero.png", fullPage: true });
  report.status = "tablero-renderizado";
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = "failure";
  report.error = String(error);
  console.error(error);
  throw error;
} finally {
  writeFileSync("arcana-partida.json", JSON.stringify(report, null, 2));
  await browser.close();
}
