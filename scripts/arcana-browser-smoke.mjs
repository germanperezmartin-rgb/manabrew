import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const diagnostics = { response: 0, isolated: false, mounted: false, body: "", errors: [] };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => diagnostics.errors.push(error.message));
  const response = await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  diagnostics.response = response?.status() ?? 0;
  await page.waitForFunction(() => Boolean(document.querySelector("#root")?.children.length), {
    timeout: 45000,
  });
  await page.waitForTimeout(7000);
  diagnostics.isolated = await page.evaluate(() => globalThis.crossOriginIsolated);
  diagnostics.mounted = await page.locator("#root").evaluate((element) => element.children.length > 0);
  diagnostics.body = (await page.locator("body").innerText()).slice(0, 2000);
  await page.screenshot({ path: "arcana-captura.png", fullPage: true });
  console.log(JSON.stringify(diagnostics, null, 2));
  if (diagnostics.response !== 200 || !diagnostics.isolated || !diagnostics.mounted) {
    throw new Error("El juego no ha superado la prueba de apertura del cliente web");
  }
} finally {
  writeFileSync("arcana-prueba.json", JSON.stringify(diagnostics, null, 2));
  await browser.close();
}
