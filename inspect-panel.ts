import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });

  try {
    // Navigate to game
    await page.goto("http://localhost:5179");
    await page.click("button:has-text('Play solo')");
    await page.waitForTimeout(1000);
    
    await page.click("button:has-text('vagabond')");
    await page.waitForTimeout(1000);
    
    const thief = await page.$("button:has-text('thief')");
    if (thief) await thief.click();
    await page.waitForTimeout(500);
    
    const baseGameDeck = await page.$("button:has-text('Base game')");
    if (baseGameDeck) await baseGameDeck.click();
    await page.waitForTimeout(500);
    
    const beginBtn = await page.$("button:has-text('Begin game')");
    if (beginBtn) await beginBtn.click();
    
    await page.waitForTimeout(4000);
    
    // Find the Vagabond panel and check its content
    const vagabondPanel = await page.$('[class*="vagabond"], [class*="panel"], aside');
    if (vagabondPanel) {
      const html = await vagabondPanel.innerHTML();
      console.log("Vagabond panel HTML:\n", html.substring(0, 2000));
      
      // Also get all text content
      const text = await vagabondPanel.textContent();
      console.log("\n\nVagabond panel text:\n", text);
    }
    
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }
}

main();
