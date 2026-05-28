import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set a larger viewport
  await page.setViewportSize({ width: 1600, height: 1000 });

  try {
    // Step 1: Home page - click Play solo
    await page.goto("http://localhost:5179");
    await page.click("button:has-text('Play solo')");
    await page.waitForTimeout(1000);
    
    // Step 2: Faction selection - click Vagabond
    await page.click("button:has-text('vagabond')");
    await page.waitForTimeout(1000);
    
    // Step 3: Character selection - click thief
    const thief = await page.$("button:has-text('thief')");
    if (thief) {
      await thief.click();
    }
    await page.waitForTimeout(500);
    
    // Step 4: Deck selection - click Base game deck
    const baseGameDeck = await page.$("button:has-text('Base game')");
    if (baseGameDeck) {
      await baseGameDeck.click();
    }
    await page.waitForTimeout(500);
    
    // Step 5: Click Begin game button
    const beginBtn = await page.$("button:has-text('Begin game')");
    if (beginBtn) {
      await beginBtn.click();
    }
    
    // Step 6: Wait for game board to fully render
    console.log("Waiting for game board to render...");
    await page.waitForTimeout(4000);
    
    // Take full page screenshot
    await page.screenshot({ path: "/tmp/vagabond-panel.png" });
    
    console.log("Screenshot saved to /tmp/vagabond-panel.png");
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
