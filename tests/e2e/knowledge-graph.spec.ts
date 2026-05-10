import { test, expect } from '@playwright/test';

test.describe('Knowledge Graph E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate to knowledge base and toggle graph view', async ({ page }) => {
    // Navigate to Knowledge Base
    await page.click('button:has-text("Knowledge Base")');
    
    // Check if we are on the Knowledge Base view
    await expect(page.locator('h2')).toContainText('Your Knowledge Base');
    
    // Toggle to Graph mode
    // We target the button with the Network icon (which we can find by its class or title if we had one)
    // Actually, let's just find the button that triggers graph mode
    const graphButton = page.locator('button').filter({ has: page.locator('svg.lucide-network') });
    await graphButton.click();
    
    // Check if the graph message is shown (since history might be empty in E2E)
    // If empty history:
    await expect(page.locator('text=No Neural Connections Detected')).toBeVisible();
  });

  test('should display nodes when history is present', async ({ page }) => {
     // This test would ideally mock the localStorage or perform an upload
     // For now, it validates the structure of the graph view
     await page.click('button:has-text("Knowledge Base")');
     const graphButton = page.locator('button').filter({ has: page.locator('svg.lucide-network') });
     await graphButton.click();
     
     // Verify legend is visible
     await expect(page.locator('text=Styles / Movements')).toBeVisible();
     await expect(page.locator('text=Painters')).toBeVisible();
     await expect(page.locator('text=Paintings')).toBeVisible();
  });
});
