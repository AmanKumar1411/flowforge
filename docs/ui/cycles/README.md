# Cycle wizard and cycle page: before and after

Faculty found the single cycle form and the cycle page hard to follow. The form became a four-step
wizard, and the page became a timeline of phases with one next action. The API and its rules did not
change, except that a faculty placing window must now end after the students' team deadline
(`null` still means no window). Screenshots were taken on 29 October 2026 with the test data the
browser checks create.

## Create and edit a cycle

| Before | After |
| --- | --- |
| [One long form](before/editor-desktop.png) ([mobile](before/editor-mobile.png)) | [1 Basics](after/wizard-1-basics-desktop.png) · [2 Teams](after/wizard-2-teams-desktop.png) · [3 Timeline](after/wizard-3-timeline-desktop.png) · [4 Review](after/wizard-4-review-desktop.png) · [Publish confirmation](after/wizard-5-publish-dialog-desktop.png) |
| | Mobile: [1](after/wizard-1-basics-mobile.png) · [2](after/wizard-2-teams-mobile.png) · [3](after/wizard-3-timeline-mobile.png) · [4](after/wizard-4-review-mobile.png) · [dialog](after/wizard-5-publish-dialog-mobile.png) |

- **Steps:** Basics, Teams, Timeline and Review, with Back and Next. Each step is checked before
  the next one opens; problems appear next to the field in plain words, and a status line announces
  how many need fixing. The draft is kept while moving between steps.
- **Your plan:** a panel beside the form (below it on phones) describes the plan in sentences as the
  faculty type, for example "Batch 2023 students form teams of 2–4 until Wed, 4 Nov".
- **Timeline:** a start date, days for each phase and a final deadline. `buildSchedule` turns them
  into the five dates the API stores, and a bar shows the phases with their dates.
- **Start from a previous cycle:** copies its settings and moves its phases to start today.
- **Review:** "Save as draft" (students can't see it yet) or "Publish to students", which first
  lists what publishing locks, taken from the API's rules.
- **Editing** uses the same wizard. A published cycle shows locked fields as locked and only moves
  the deadlines whose phase is still running.

## The cycle page

| Before | After |
| --- | --- |
| [Faculty](before/detail-faculty-desktop.png) ([mobile](before/detail-faculty-mobile.png)) | [Work phase](after/page-work-desktop.png) ([mobile](after/page-work-mobile.png)) · [An idea waiting for review](after/page-attention-desktop.png) ([mobile](after/page-attention-mobile.png)) · [Closed](after/page-closed-desktop.png) ([mobile](after/page-closed-mobile.png)) |
| [Student](before/detail-student-desktop.png) | [Student](after/page-student-desktop.png) ([mobile](after/page-student-mobile.png)) |

- **Header:** title, status, course and batch, the cycle's facts in one line, and one primary action
  for the current state: "Publish to students", "Place 3 students", "Review 2 ideas",
  "View submissions" or "Close the cycle".
- **Phases:** Teams, the faculty's placing window when there is one, Ideas, Work and Closed. Finished
  phases are ticked, the current one is outlined and labelled "Now", and a "Today" line sits inside
  it; every state is written out, so colour is never the only signal.
- **Needs your attention:** only things the faculty can act on (students without a team during the
  placing window, ideas waiting for review, teams that can't submit, an elective with nobody
  enrolled). The card is hidden when there is nothing.
- **Sections:** Students, Idea list, Teams, Ideas and Submissions, each with a one-line summary. The
  current phase's section starts open; the viewer's own choices are remembered on their device.
  Empty sections say one helpful thing, and a closed cycle reads in the past tense.

## First-time faculty walkthrough

The path to a valid draft is: course name, cycle title, check the batch, Next three times, Save.
Everything else has working defaults. Walking it as someone new found these, now fixed:

| Found | Fix |
| --- | --- |
| "Submissions open Thu, 12 Nov 2026 · 12:00 AM" reads like the night before | "From the start of Thu, 12 Nov 2026" |
| An open section repeated its own title under its summary | The first panel's title is kept for screen readers only |
| The "Today" label overhung the bar when a phase had just started | It stays inside the bar near either end |
| "1 idea were offered" on a closed cycle | "1 idea was offered · none was picked" |

## Accessibility

- Each field's label, hint and problem are tied together (`aria-describedby`, `aria-invalid`).
- Step problems are announced through a live status line.
- Next moves focus to the new step's heading.
- The publish dialog takes focus and closes with Escape.
- Sections are `<details>`, so they open with the keyboard.
- Checked in the browser suite: keyboard only, and no sideways scrolling at 375px.
