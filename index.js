const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Apply the stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 4000;

// Helper function to create a delay (replaces page.waitForTimeout)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to get Crash History Data from bc.game
async function getCrashHistoryData() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, // Set to false for debugging to see the browser
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-size=1200,800',
                '--disable-dev-shm-usage',
                '--disable-gpu' // Often good to add for headless environments
            ]
        });
        const page = await browser.newPage();

        // Set User-Agent to mimic a real browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

        const url = 'https://bc.game/game/crash';
        console.log(`[Puppeteer] Navigating to: ${url}`);
        // Increased timeout for page loading
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

        // Add a random delay after page load
        await delay(Math.random() * 2000 + 1000); // Wait between 1 to 3 seconds

        // Click the "History" button
        const tabButtonsSelector = 'button.tabs-btn.btn-like';

        // Wait for the tab buttons to appear
        await page.waitForSelector(tabButtonsSelector, { timeout: 15000 });

        console.log("[Puppeteer] Finding and clicking 'History' button...");
        const clicked = await page.evaluate((selector) => {
            const buttons = document.querySelectorAll(selector);
            for (const btn of buttons) {
                if (btn.textContent.trim() === 'History') {
                    btn.click();
                    return true;
                }
            }
            return false;
        }, tabButtonsSelector);

        if (!clicked) {
            throw new Error("Could not find or click the 'History' button.");
        }

        // Add a random delay after clicking to allow data to generate
        await delay(Math.random() * 2000 + 1000);

        // Wait for the "History" table to appear
        const tableSelector = 'table.w-full.caption-bottom.text-sm';
        console.log("[Puppeteer] Waiting for history table to appear...");
        await page.waitForSelector(tableSelector, { timeout: 20000 }); // Increased timeout for the table

        // Extract data from the table
        console.log("[Puppeteer] Extracting data from the table...");
        const tableData = await page.evaluate((selector) => {
            const table = document.querySelector(selector);
            if (!table) return null;

            const rows = Array.from(table.querySelectorAll('tbody tr'));
            const extractedData = [];

            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length > 0) {
                    const rowData = cells.map(cell => cell.textContent.trim());
                    extractedData.push(rowData);
                }
            });
            return extractedData;
        }, tableSelector);

        console.log("[Puppeteer] Extraction complete.");
        return tableData;

    } catch (error) {
        console.error("[Puppeteer] An error occurred during extraction:", error);
        if (error.message.includes('ERR_CONNECTION_REFUSED') || error.message.includes('TimeoutError')) {
            console.error("Note: The website might be blocking the connection or data loading is too slow/unstable.");
            console.error("Please try checking manually or consider using proxies and stronger anti-bot measures.");
        }
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log("[Puppeteer] Browser closed.");
        }
    }
}

// --- Define API Endpoint ---

app.get('/api/bcgame/crash-history', async(req, res) => {
    console.log(`[Express] Request received at /api/bcgame/crash-history`);
    try {
        const data = await getCrashHistoryData();
        if (data) {
            res.json({
                success: true,
                message: "Crash history data retrieved successfully.",
                data: data
            });
        } else {
            res.status(500).json({
                success: false,
                message: "Could not retrieve Crash history data. Please check server logs."
            });
        }
    } catch (error) {
        console.error("[Express] Error handling request:", error);
        res.status(500).json({
            success: false,
            message: "An internal server error occurred while retrieving data."
        });
    }
});

// Default endpoint for the homepage
app.get('/', (req, res) => {
    res.send('Welcome to the BC.Game Crash data scraping API. Access <a href="/api/bcgame/crash-history">/api/bcgame/crash-history</a> to get data.');
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Express server running at http://localhost:${PORT}`);
    console.log(`Data endpoint: http://localhost:${PORT}/api/bcgame/crash-history`);
    console.log(`Check console for Puppeteer logs.`);
});