import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Navigating to http://localhost:5179...");
    await page.goto("http://localhost:5179", { waitUntil: "networkidle" });
    
    // Wait for buttons to appear
    await page.waitForSelector("button", { timeout: 5000 });
    
    // Get all buttons and their text
    const buttons = await page.$$("button");
    console.log(`Found ${buttons.length} buttons:`);
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].textContent();
      console.log(`  ${i}: "${text}"`);
    }
    
    // Get all clickable elements
    const allElements = await page.$$("*");
    console.log(`\nTotal elements: ${allElements.length}`);
    
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
