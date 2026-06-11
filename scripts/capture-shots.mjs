import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "demo@lula.app");
await page.fill('input[type="password"]', "DemoLula2026!");
await page.click('button[type="submit"]');
await page.waitForURL("**/panel", { timeout: 15000 });

const shots = [
  ["panel", "/panel"],
  ["campanas", "/campanas"],
  ["inbox", "/inbox"],
  ["contactos", "/contactos"],
];
for (const [name, path] of shots) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `public/shots/${name}.png` });
  console.log("shot:", name);
}

await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
const first = page.locator('a[href^="/inbox/"]').first();
await first.click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "public/shots/inbox-hilo.png" });
console.log("shot: inbox-hilo");

await browser.close();
console.log("DONE");
