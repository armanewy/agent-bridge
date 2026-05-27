import { expect, test } from "@playwright/test";

test.describe("desktop renderer mock scenarios", () => {
  test("opens the empty workbench with setup blockers", async ({ page }) => {
    await page.goto("/?scenario=empty");

    await expect(page.getByTestId("app-shell")).toBeVisible();
    await expect(page.getByTestId("workbench-view")).toBeVisible();
    await expect(page.getByText("Codex is not ready.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  test("starts an autopilot mission from the connected workbench", async ({ page }) => {
    await page.goto("/?scenario=connected");

    await expect(page.getByTestId("workbench-view")).toBeVisible();
    await page.getByPlaceholder("Describe the task...").fill(JSON.stringify(sampleTaskSpec(), null, 2));

    const startButton = page.getByRole("button", { name: "Start" });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  });

  test("generates a TaskSpec from a planned scenario", async ({ page }) => {
    await page.goto("/?scenario=mission-planned");

    await expect(page.getByText("Add browser-first UI tests")).toBeVisible();
    const generateButton = page.getByRole("button", { name: "Generate TaskSpec" });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    await expect(page.getByText("Mock Workbench Task")).toBeVisible();
  });

  test("shows verification failure evidence on the verify tab", async ({ page }) => {
    await page.goto("/?scenario=verification-failed");

    await page.getByTestId("workbench-tab-verify").click();

    await expect(page.getByText("Mock verification failed: a smoke test caught a UI regression.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Verification" })).toBeEnabled();
  });

  test("opens settings directly from the URL", async ({ page }) => {
    await page.goto("/?scenario=connected&view=settings");

    await expect(page.getByTestId("settings-view")).toBeVisible();
    await expect(page.getByText("Planner: ChatGPT handoff")).toBeVisible();
    await expect(page.getByText("AgentBridge can send prompts into selected existing Codex threads.")).toBeVisible();
    await expect(page.getByText("Can send", { exact: true })).toBeVisible();
  });

  test("keeps the simple workbench inside 760x940 without diagnostic surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 940 });
    await page.goto("/?scenario=connected&view=workbench");

    await expect(page.getByTestId("workbench-view")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    await expect(page.getByTestId("workbench-tab-task")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
  });

  test("keeps advanced diagnostics available at 760x940", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 940 });
    await page.goto("/?scenario=connected&view=advanced&advancedView=components");

    await expect(page.getByTestId("advanced-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Components" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Audit" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
  });
});

function sampleTaskSpec() {
  return {
    title: "Add browser UI smoke test",
    goal: "Add a fast browser UI smoke test.",
    background: "AgentBridge should verify the renderer loop.",
    instructions: ["Add a small smoke test."],
    requirements: ["Start button can run from an imported plan."],
    constraints: ["Keep changes scoped."],
    nonGoals: ["Do not add alternate planner routes."],
    acceptanceCriteria: ["The mock mission starts."],
    suggestedFiles: ["tests/ui/desktop-renderer.spec.ts"],
    verificationSteps: ["pnpm ui:test"],
    expectedSummaryFormat: "Summary and tests."
  };
}
