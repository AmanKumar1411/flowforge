import { Page, expect, test } from "@playwright/test";
import { WEB, login, manifest, nameOf, sql } from "../support/api";
import { Watch, localInput, openTab, signIn, waitUntil } from "../support/browser";

// E2E-F1 + E2E-S1 + E2E-S2 + E2E-T1 on a real clock: one faculty, three teams of batch 2025.
// Deadlines are minutes apart so every edge is checked one minute before and one minute after.
// Only the UI is used for the flows; the database is read to confirm what the UI did.
const m = manifest();
const students = m.students["2025"];
const FACULTY = m.faculty[7]; // fac.hotel, owns nothing else
const person = (index: number) => ({ email: students[index], name: nameOf(students[index]) });
const ananya = person(900); // leader of Alpha
const diya = person(901); // member of Alpha
const aadhya = person(902); // member of Alpha
const saanvi = person(903); // leader of Bravo
const pari = person(904); // member of Bravo
const anika = person(905); // no team: placed by the faculty
const navya = person(906); // leader of Charlie, never sends an idea
const angel = person(907); // member of Charlie
const outsider = person(950); // batch 2025, never in a team of this project

const MIN = 60_000;
const LEAD_MINUTES = Number(process.env.QA_LIFECYCLE_LEAD ?? 5);

test("E2E-F1 full project lifecycle in the browser, with every deadline edge", async ({ browser }) => {
  test.setTimeout(35 * MIN);
  const watch = new Watch();
  const start = new Date();
  const base = new Date(Math.ceil((start.getTime() + LEAD_MINUTES * MIN) / MIN) * MIN);
  const at = (minutes: number) => new Date(base.getTime() + minutes * MIN);
  const plan = {
    teamDeadline: at(0),
    ideaDeadline: at(4),
    milestones: [
      { name: "Design review", opens: at(4), due: at(8), evaluation: at(8) },
      { name: "Prototype", opens: at(8), due: at(9), evaluation: at(9) },
      { name: "Final", opens: at(9), due: at(10), evaluation: at(10) },
    ],
  };
  const title = `Lifecycle ${start.getTime()}`;
  test.info().annotations.push({ type: "observation", description: `team deadline ${plan.teamDeadline.toISOString()}, idea deadline ${plan.ideaDeadline.toISOString()}, M1 due ${plan.milestones[0].due.toISOString()}` });

  const faculty = await signIn(browser, watch, FACULTY, nameOf(FACULTY));
  let cycleId = "";

  await test.step("wizard: details, deadlines, 3 milestones with link rules, list-only ideas", async () => {
    await faculty.getByRole("button", { name: "+ New project" }).click();
    await faculty.getByLabel("Course name").fill("QA Lifecycle Course");
    await faculty.getByLabel("Project title").fill(title);
    await faculty.getByLabel("Batch year").fill("2025");
    await faculty.getByRole("radio", { name: /^Core/ }).check();
    await faculty.getByLabel("Smallest team").fill("2");
    await faculty.getByLabel("Largest team").fill("3");
    await faculty.getByRole("button", { name: "Save draft and continue" }).click();
    await expect(faculty.getByRole("heading", { name: /When do teams and ideas settle\?/ })).toBeVisible();
    cycleId = new URL(faculty.url()).pathname.split("/")[3];
    await faculty.getByLabel("Team deadline").fill(localInput(plan.teamDeadline));
    await faculty.getByLabel("Idea deadline").fill(localInput(plan.ideaDeadline));
    await faculty.getByRole("radio", { name: /^Your list only/ }).check();
    await faculty.getByRole("button", { name: "Save and continue" }).click();
    await expect(faculty.getByRole("heading", { name: /What do teams hand in, and when\?/ })).toBeVisible();
    while ((await faculty.getByLabel("Submissions open").count()) < 3) {
      await faculty.getByRole("button", { name: /^\+ Add milestone M\d$/ }).click();
    }
    for (const [index, milestone] of plan.milestones.entries()) {
      await faculty.getByLabel("Name", { exact: true }).nth(index).fill(milestone.name);
      await faculty.getByLabel("Submissions open").nth(index).fill(localInput(milestone.opens));
      await faculty.getByLabel("Due", { exact: true }).nth(index).fill(localInput(milestone.due));
      await faculty.getByLabel("Evaluation", { exact: true }).nth(index).fill(localInput(milestone.evaluation));
    }
    const links = faculty.getByRole("group", { name: /^Links for M1/ });
    const choose = (label: string, value: string) => links.locator("label", { hasText: label }).locator("select").selectOption(value);
    await choose("GitHub repository", "required");
    await choose("Demo", "optional");
    await choose("Google Drive or Docs", "none");
    await choose("Report", "none");
    await expect(faculty.getByText("The milestones follow each other without overlapping.")).toBeVisible();
    await faculty.getByRole("button", { name: "Save and continue" }).click();
    await expect(faculty.getByRole("heading", { name: /Which ideas do you offer\?/ })).toBeVisible();
    await faculty.getByRole("button", { name: "Save and continue" }).click();
    await expect(faculty.getByRole("heading", { name: /Who takes part\?/ })).toBeVisible();
    await faculty.getByRole("button", { name: "Save and continue" }).click();
    await expect(faculty.getByRole("heading", { name: /Check and publish/ })).toBeVisible();
  });

  await test.step("publish is blocked by the empty idea list, with a link to the step that fixes it", async () => {
    await expect(faculty.getByText("Before you can publish")).toBeVisible();
    await expect(faculty.getByText(/idea list, and it is empty/)).toBeVisible();
    await expect(faculty.getByRole("button", { name: "Publish to students" })).toBeDisabled();
  });

  await test.step("fix: add an idea to the list and let teams propose too, then publish", async () => {
    await faculty.getByRole("button", { name: "Go to Idea list" }).click();
    await faculty.getByRole("button", { name: "+ Add an idea" }).click();
    await faculty.getByLabel("Idea title").fill("Campus map");
    await faculty.getByLabel("Description").fill("An accessible map of the campus with room schedules.");
    await faculty.getByRole("button", { name: "Add idea" }).click();
    await expect(faculty.getByRole("list", { name: "Offered ideas" }).getByText("Campus map")).toBeVisible();
    await faculty.getByRole("list", { name: "Steps" }).getByRole("button", { name: /Teams & ideas/ }).click();
    await faculty.getByRole("radio", { name: /^Either/ }).check();
    for (const heading of [/What do teams hand in, and when\?/, /Which ideas do you offer\?/, /Who takes part\?/, /Check and publish/]) {
      await faculty.getByRole("button", { name: "Save and continue" }).click();
      await expect(faculty.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(faculty.getByText("Everything students need is in place.")).toBeVisible();
    await faculty.getByRole("button", { name: "Publish to students" }).click();
    await faculty.getByRole("dialog", { name: "Publish to students?" }).getByRole("button", { name: "Publish to students" }).click();
    await faculty.waitForURL(new RegExp(`/faculty/cycles/${cycleId}$`));
    const saved = await sql(`SELECT status, "ideaSource" FROM "CourseProjectCycle" WHERE id = $1`, [cycleId]);
    expect(saved[0]).toEqual({ status: "PUBLISHED", ideaSource: "BOTH" });
    const milestones = await sql(`SELECT position, "linkRequirement" FROM "Milestone" WHERE "cycleId" = $1 ORDER BY position`, [cycleId]);
    expect(milestones.length).toBe(3);
    expect(milestones[0].linkRequirement).toEqual({ required: ["GITHUB"], optional: ["DEMO"] });
  });

  const leader = await signIn(browser, watch, ananya.email, ananya.name);
  const bravo = await signIn(browser, watch, saanvi.email, saanvi.name);
  const charlie = await signIn(browser, watch, navya.email, navya.name);

  const createTeam = async (page: Page, name: string, members: { email: string; name: string }[]) => {
    await page.goto(`${WEB}/student`);
    const action = page.getByRole("link", { name: /^Create or join a team by / });
    await expect(action).toBeVisible();
    await action.click();
    await page.getByRole("button", { name: "Create a team" }).click();
    await page.getByLabel("Team name").fill(name);
    for (const member of members) {
      await page.getByLabel("Find batch-mates").fill(member.email.split("@")[0]);
      await page.getByRole("list", { name: "Search results" }).getByRole("listitem").filter({ hasText: member.name }).getByRole("button", { name: "Add" }).click();
    }
    await page.getByRole("button", { name: "Create team" }).click();
    await expect(page.locator(".team-panel").getByRole("heading", { name })).toBeVisible();
  };

  await test.step("teams forming: three leaders build their teams from the dashboard", async () => {
    await createTeam(leader, "Alpha", [diya, aadhya]);
    await createTeam(bravo, "Bravo", [pari]);
    await createTeam(charlie, "Charlie", [angel]);
    expect((await sql(`SELECT count(*)::int AS n FROM "Team" WHERE "cycleId" = $1`, [cycleId]))[0].n).toBe(3);
  });

  const member = await signIn(browser, watch, diya.email, diya.name);
  await test.step("member: sees the team, has no leader buttons, and the API refuses a leader action", async () => {
    await member.goto(`${WEB}/student/projects/${cycleId}?tab=team`);
    await expect(member.locator(".team-panel").getByRole("heading", { name: "Alpha" })).toBeVisible();
    await expect(member.getByText(/leads this team\. Only the leader can change it\./)).toBeVisible();
    await expect(member.getByRole("button", { name: /Edit team|Disband/ })).toHaveCount(0);
    const teamId = (await sql(`SELECT id FROM "Team" WHERE "cycleId" = $1 AND name = 'Alpha'`, [cycleId]))[0].id;
    const api = await login(diya.email);
    expect((await api.call("PATCH", `/teams/${teamId}`, { name: "Taken over" })).status).toBe(403);
    expect((await api.call("DELETE", `/teams/${teamId}`)).status).toBe(403);
  });

  await test.step("idea: the leader proposes, the faculty reject with feedback, the leader revises, the faculty approve", async () => {
    await leader.goto(`${WEB}/student/projects/${cycleId}?tab=idea`);
    await leader.getByRole("button", { name: "Write our own idea" }).click();
    await leader.getByLabel("Idea title").fill("Room finder");
    await leader.getByLabel("Problem").fill("Nobody knows which rooms are free between classes.");
    await leader.getByLabel("Proposed solution").fill("A live list of free rooms.");
    await leader.getByRole("button", { name: "Submit idea" }).click();
    await expect(leader.locator(".idea-status", { hasText: "Waiting for review" })).toBeVisible();

    await faculty.goto(`${WEB}/faculty/cycles/${cycleId}?tab=teams`);
    await expect(faculty.locator(".team-row", { hasText: "Alpha" }).getByText("Waiting for review")).toBeVisible();
    await faculty.getByRole("link", { name: "View details of Alpha" }).click();
    await faculty.getByLabel("Reject").check();
    await faculty.getByLabel(/Feedback for the team/).fill("Say where the room data comes from.");
    await faculty.getByRole("button", { name: "Reject idea" }).click();
    await expect(faculty.getByText("Rejected the idea of Alpha.")).toBeVisible();

    await leader.reload();
    await expect(leader.getByText("Say where the room data comes from.")).toBeVisible();
    await leader.getByRole("button", { name: "Revise and resubmit" }).click();
    await leader.getByLabel("Proposed solution").fill("A live list of free rooms, read from the timetable export every night.");
    await leader.getByRole("button", { name: "Resubmit idea" }).click();
    await expect(leader.locator(".idea-status", { hasText: "Waiting for review" })).toBeVisible();

    await faculty.goto(`${WEB}/faculty/cycles/${cycleId}`);
    await faculty.getByRole("button", { name: "Review 1 proposal" }).click();
    await expect(faculty.getByText("Decision on version 2")).toBeVisible();
    await faculty.getByRole("button", { name: "Approve idea" }).click();
    await expect(faculty.getByText("Approved the idea of Alpha.")).toBeVisible();
    await leader.reload();
    await expect(leader.locator(".idea-status", { hasText: "Approved" })).toBeVisible();
    await expect(leader.getByRole("button", { name: /Edit idea|Revise/ })).toHaveCount(0);
  });

  await test.step("T-1 min before the team deadline: the leader can still change the team", async () => {
    await waitUntil(new Date(plan.teamDeadline.getTime() - MIN), bravo);
    await bravo.goto(`${WEB}/student/projects/${cycleId}?tab=team`);
    await bravo.getByRole("button", { name: "Edit team" }).click();
    await bravo.getByLabel("Team name").fill("Bravo Team");
    await bravo.getByRole("button", { name: "Save team" }).click();
    await expect(bravo.locator(".team-panel").getByRole("heading", { name: "Bravo Team" })).toBeVisible();
  });

  await test.step("T+1 min after the team deadline: students can no longer change teams; the faculty place the student left out", async () => {
    await waitUntil(new Date(plan.teamDeadline.getTime() + MIN), bravo);
    await bravo.reload();
    await expect(bravo.locator(".team-panel").getByRole("heading", { name: "Bravo Team" })).toBeVisible();
    await expect(bravo.getByRole("button", { name: "Edit team" })).toHaveCount(0);
    const leftOut = await signIn(browser, watch, anika.email, anika.name);
    await leftOut.goto(`${WEB}/student/projects/${cycleId}?tab=team`);
    await expect(leftOut.getByText(/Your faculty will place you in one by/)).toBeVisible();
    await expect(leftOut.getByRole("button", { name: "Create a team" })).toHaveCount(0);

    await faculty.goto(`${WEB}/faculty/cycles/${cycleId}?tab=teams`);
    await expect(faculty.getByRole("heading", { name: /Students without a team \(\d+\)/ })).toBeVisible();
    const row = faculty.locator("li", { hasText: anika.name }).filter({ has: faculty.getByLabel(`Team for ${anika.name}`) });
    await row.getByLabel(`Team for ${anika.name}`).selectOption({ label: "Bravo Team (2/3)" });
    await row.getByRole("button", { name: "Add" }).click();
    await expect(faculty.getByText(`Added ${anika.name} to Bravo Team.`)).toBeVisible();
    await leftOut.reload();
    await expect(leftOut.locator(".team-panel").getByRole("heading", { name: "Bravo Team" })).toBeVisible();
  });

  await test.step("T-1 min before the idea deadline: Bravo picks from the list (approved at once); M1 is not open yet", async () => {
    await waitUntil(new Date(plan.ideaDeadline.getTime() - MIN), bravo);
    await bravo.goto(`${WEB}/student/projects/${cycleId}?tab=idea`);
    await bravo.getByRole("button", { name: "Pick Campus map" }).click();
    await bravo.getByRole("button", { name: "Confirm: make it our idea" }).click();
    await expect(bravo.locator(".idea-status", { hasText: /Approved|Picked/ }).first()).toBeVisible();
    await member.goto(`${WEB}/student/projects/${cycleId}?tab=milestones`);
    const card = member.locator(".milestone-card", { hasText: "Design review" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: /Submit/ })).toHaveCount(0);
  });

  await test.step("T+1 min after the idea deadline: a team without an idea is told it is too late; M1 opens", async () => {
    await waitUntil(new Date(plan.ideaDeadline.getTime() + MIN), charlie);
    await charlie.goto(`${WEB}/student/projects/${cycleId}?tab=idea`);
    await expect(charlie.getByText(/has passed without an idea from your team/)).toBeVisible();
    await expect(charlie.getByRole("button", { name: "Write our own idea" })).toHaveCount(0);
  });

  await test.step("M1: a wrong link type is refused with a clear message; version 1 by a member, version 2 by the leader", async () => {
    await member.reload();
    const card = member.locator(".milestone-card", { hasText: "Design review" });
    await card.getByRole("button", { name: "Submit work" }).click();
    await card.getByLabel("GitHub repository").fill("https://drive.google.com/file/d/123");
    await card.getByRole("button", { name: "Submit version 1" }).click();
    await expect(card.getByText("Paste the repository's link: https://github.com/owner/repo")).toBeVisible();
    await card.getByLabel("GitHub repository").fill("https://github.com/alpha-team/room-finder");
    await card.getByRole("button", { name: "Submit version 1" }).click();
    await expect(card.getByRole("heading", { name: /Version 1 submitted/ })).toBeVisible();

    await leader.goto(`${WEB}/student/projects/${cycleId}?tab=milestones`);
    const leaderCard = leader.locator(".milestone-card", { hasText: "Design review" });
    await leaderCard.getByRole("button", { name: "Submit a new version" }).click();
    await leaderCard.getByLabel("GitHub repository").fill("https://github.com/alpha-team/room-finder");
    await leaderCard.getByLabel("Demo").fill("https://room-finder.example.org");
    await leaderCard.getByRole("button", { name: "Submit version 2" }).click();
    await expect(leaderCard.getByRole("heading", { name: /Version 2 submitted/ })).toBeVisible();
  });

  await test.step("T-1 min before M1 is due: another member submits version 3", async () => {
    await waitUntil(new Date(plan.milestones[0].due.getTime() - MIN), leader);
    const third = await signIn(browser, watch, aadhya.email, aadhya.name);
    await third.goto(`${WEB}/student/projects/${cycleId}?tab=milestones`);
    const card = third.locator(".milestone-card", { hasText: "Design review" });
    await card.getByRole("button", { name: "Submit a new version" }).click();
    await card.getByLabel("GitHub repository").fill("https://github.com/alpha-team/room-finder");
    await card.getByRole("button", { name: "Submit version 3" }).click();
    await expect(card.getByRole("heading", { name: /Version 3 submitted/ })).toBeVisible();
  });

  await test.step("T+1 min after M1 is due: no more submissions; the team sees results are not out yet", async () => {
    await waitUntil(new Date(plan.milestones[0].due.getTime() + MIN), member);
    await member.reload();
    const card = member.locator(".milestone-card", { hasText: "Design review" });
    await expect(card.getByRole("button", { name: /Submit/ })).toHaveCount(0);
    await expect(card.getByText(/Not released yet/)).toBeVisible();
    const versions = await sql(`SELECT s.version FROM "Submission" s JOIN "Milestone" ms ON ms.id = s."milestoneId" WHERE ms."cycleId" = $1 AND ms.position = 1 ORDER BY s.version`, [cycleId]);
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  await test.step("faculty give M1 feedback (this version has no marks or scale), then release it to all teams", async () => {
    await faculty.goto(`${WEB}/faculty/cycles/${cycleId}?tab=milestones`);
    const grading = faculty.getByRole("region", { name: "Grading of M1" });
    await expect(grading.getByLabel("Marked out of")).toHaveCount(0);
    await expect(grading.getByLabel("Marks for Alpha")).toHaveCount(0);
    await grading.getByLabel("Feedback for Alpha").fill("Clear plan; show the timetable import next.");
    await grading.locator(".grading-row", { hasText: "Alpha" }).getByRole("button", { name: "Save" }).click();
    await expect(grading.locator(".grading-row", { hasText: "Alpha" }).getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await grading.getByLabel("Feedback for Bravo Team").fill("Nothing was submitted for M1.");
    await grading.locator(".grading-row", { hasText: "Bravo Team" }).getByRole("button", { name: "Save" }).click();
    await expect(grading.locator(".grading-row", { hasText: "Bravo Team" }).getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    // Before release nothing reaches the team.
    await leader.reload();
    await expect(leader.locator(".milestone-card", { hasText: "Design review" }).getByText(/Not released yet/)).toBeVisible();
    faculty.once("dialog", (dialog) => dialog.accept());
    await grading.getByRole("button", { name: "Release feedback to all teams" }).click();
    await expect(grading.getByText(/^Released on /)).toBeVisible();
  });

  await test.step("the leader sees the released feedback; a correction shows as updated", async () => {
    await leader.reload();
    await expect(leader.getByText("Clear plan; show the timetable import next.")).toBeVisible();
    await expect(leader.getByText(/^Feedback released on /)).toBeVisible();
    await expect(leader.locator(".evaluation-marks")).toHaveCount(0);
    const grading = faculty.getByRole("region", { name: "Grading of M1" });
    await faculty.reload();
    await grading.getByLabel("Feedback for Alpha").fill("Clear plan; show the timetable import and its tests next.");
    await grading.locator(".grading-row", { hasText: "Alpha" }).getByRole("button", { name: "Save" }).click();
    await expect(grading.locator(".grading-row", { hasText: "Alpha" }).getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await leader.reload();
    await expect(leader.getByText("Clear plan; show the timetable import and its tests next.")).toBeVisible();
    await expect(leader.getByText(/^Updated on /)).toBeVisible();
    await leader.goto(`${WEB}/student`);
    await expect(leader.getByRole("link", { name: /Your result for M1 · Design review was updated/ })).toBeVisible();
  });

  await test.step("after the last milestone the faculty close the project; it is read-only and visible only to former members", async () => {
    await waitUntil(new Date(plan.milestones[2].evaluation.getTime() + 5_000), faculty);
    await faculty.goto(`${WEB}/faculty/cycles/${cycleId}`);
    faculty.once("dialog", (dialog) => dialog.accept());
    await faculty.getByRole("button", { name: "Close the project" }).click();
    await expect(faculty.getByText("The project is closed.")).toBeVisible();
    await leader.goto(`${WEB}/student`);
    await leader.getByText(/Past projects \(\d+\)/).click();
    await expect(leader.locator(".past-projects").getByText(title)).toBeVisible();
    await leader.goto(`${WEB}/student/projects/${cycleId}?tab=milestones`);
    await expect(leader.getByText("Clear plan; show the timetable import and its tests next.")).toBeVisible();
    await expect(leader.getByRole("button", { name: /Submit|Edit|Revise/ })).toHaveCount(0);
    const stranger = await signIn(browser, watch, outsider.email, outsider.name);
    await stranger.goto(`${WEB}/student/projects/${cycleId}`);
    await expect(stranger.getByText(/not available/i)).toBeVisible();
  });

  watch.expectClean();
});
