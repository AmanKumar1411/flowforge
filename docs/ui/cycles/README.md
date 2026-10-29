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

The second pass below replaced this page's Teams, Ideas and Submissions sections with one teams
list, a page per team and a side column.

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

## Second pass: two columns, a teams list, team pages, semesters

The cycle page above still read like a long form on a wide screen. This pass changed the page and
the wizard's semester fields; the API did not change. Screenshots were taken on 29 October 2026
with seeded test data: an elective nobody is enrolled in yet, an elective with two teams, and a
core cycle in its work phase (one proposal waiting, a pick from the list, a rejection, versions of
work). They are in `page-layout/`, at 1440px and 375px wide.

| Page | Before | After |
| --- | --- | --- |
| Core cycle | [1440](page-layout/before/page-core-1440.png) · [375](page-layout/before/page-core-375.png) | [1440](page-layout/after/page-core-1440.png) · [375](page-layout/after/page-core-375.png) |
| Elective, nobody enrolled | [1440](page-layout/before/page-elective-empty-1440.png) · [375](page-layout/before/page-elective-empty-375.png) | [1440](page-layout/after/page-elective-empty-1440.png) · [375](page-layout/after/page-elective-empty-375.png) |
| Elective with teams | [1440](page-layout/before/page-elective-teams-1440.png) · [375](page-layout/before/page-elective-teams-375.png) | [1440](page-layout/after/page-elective-teams-1440.png) · [375](page-layout/after/page-elective-teams-375.png) |
| One team | Spread over the Ideas and Submissions sections: [1440](page-layout/before/team-detail-1440.png) · [375](page-layout/before/team-detail-375.png) | Its own page, a proposal to review: [1440](page-layout/after/team-detail-1440.png) · [375](page-layout/after/team-detail-375.png); with submissions: [1440](page-layout/after/team-detail-submissions-1440.png) · [375](page-layout/after/team-detail-submissions-375.png) |
| Wizard semester | A number and a typed academic year | [Term beside the picker](page-layout/after/wizard-semester-1440.png) ([375](page-layout/after/wizard-semester-375.png)) · [Dates outside the term](page-layout/after/wizard-term-warning-1440.png) ([375](page-layout/after/wizard-term-warning-375.png)) |

- **Layout:**
  - Every page sits in one container up to 1280px wide, with side padding down to 16px.
  - The cycle page's header spans it: status and course on one line, a 32–44px title, the
    metadata line, and the actions on the right.
  - From 1024px the teams list takes two thirds and a side column the rest. The side column holds
    "Needs your attention" and the cycle at a glance.
  - Narrower screens stack them, attention first.
  - Checked at 1440, 1280, 1024, 768 and 375px, with no sideways scrolling at any width.
- **Phase bar:**
  - Each phase is at least as wide as its two lines of text and grows only partly with its length.
  - A phase that starts where the last one ended shows only "Until <day>", so each deadline
    appears once, here.
  - "Today" sits above its phase, clear of the edge.
  - Where the bar has no room (the wizard's column, phones) it becomes a list.
- **Teams list:**
  - One row per team: team, leader, members (n/max), idea or proposal with its status, submissions,
    and "View details".
  - From 11 teams a search and an idea-status filter appear.
  - With no team, one line says what comes next.
- **Team page** (`/faculty/cycles/:id/teams/:id`):
  - the members, leader marked, with emails;
  - the picked idea, or the proposal as submitted with every review, and the approve or reject
    form;
  - every version of the work, the newest marked Latest (Final once submissions close);
  - during the faculty's window, adding a student without a team.
  - One waiting proposal opens its team straight from the header or the attention card.
- **By course type:**
  - `PAGE_PARTS` in `cycle-page.ts` decides what each type shows.
  - Both show the teams list, "n of m teams submitted" and "Enrolled students (n) · Manage" (or
    "Batch 2023 students (n) · Manage"); the roster moved to `/faculty/cycles/:id/students`.
  - A core course also shows its idea list and the students without a team.
- **Wording:**
  - The header's one button follows the state: "Enroll students", "Place 3 students", "Review 1
    proposal", "See the teams", and so on. A closed cycle has none.
  - The attention card lists only actions.
  - A cycle with no students shows no team-completion text.
  - The metadata line reads "Elective · open to enrolled students · Teams of 2–4 · Semester 7
    (Aug–Dec 2026)".
- **Semesters:**
  - Odd semesters run August to December and even ones January to May, counted from the batch's
    admission year (`semester.ts: semesterTerm`).
  - The wizard offers 1 to 8, shows the term beside the picker, and sends the academic year that
    follows.
  - A new plan starts inside the term.
  - Dates outside it get a warning, not a block.

Judgment calls in this pass:

| Asked | Done | Why |
| --- | --- | --- |
| Key dates in the side column | The phase bar, across the page under the header | Deadlines are stated once, and a horizontal bar needs the width |
| A team page or a drawer | A page with a back link | The app already opens a cycle and its editor as pages; a page also has a link to share |
| "No students → Enroll students" | Electives say "Enroll students", core courses "Add students" | A core course's students are its batch; the faculty register them, not enroll them |
| Semesters 1–8 | The wizard offers 1–8; the API still accepts 1–12 | No API change; an older cycle's semester stays visible in the picker |

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
