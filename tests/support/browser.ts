import { Browser, BrowserContextOptions, Page, expect } from "@playwright/test";
import { WEB } from "./api";

/**
 * Collects what must never happen on any page: console errors, uncaught exceptions and 5xx responses.
 * 4xx "Failed to load resource" console lines are expected on negative steps and are kept separately.
 */
export class Watch {
  readonly problems: string[] = [];
  readonly clientErrors: string[] = [];

  attach(page: Page, who: string): Page {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) this.clientErrors.push(`${who}: ${text}`);
      else this.problems.push(`${who} console: ${text}`);
    });
    page.on("pageerror", (error) => this.problems.push(`${who} uncaught: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 500) this.problems.push(`${who} ${response.status()} ${response.request().method()} ${response.url()}`);
    });
    return page;
  }

  expectClean(): void {
    expect(this.problems, "console errors, uncaught exceptions or 5xx").toEqual([]);
  }
}

/** Signs in through the login page's test-only form (the UI path a tester would use). */
export async function signIn(browser: Browser, watch: Watch, email: string, name: string, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options);
  const page = watch.attach(await context.newPage(), name);
  await page.goto(`${WEB}/login`);
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await page.waitForURL((url) => !["/login", "/auth/callback"].includes(url.pathname));
  return page;
}

export async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

/** A datetime-local value (local time, minute precision). */
export function localInput(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function waitUntil(when: Date, page?: Page): Promise<void> {
  const ms = when.getTime() - Date.now();
  if (ms <= 0) return;
  if (page) await page.waitForTimeout(ms);
  else await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name, exact: true }).click();
}
