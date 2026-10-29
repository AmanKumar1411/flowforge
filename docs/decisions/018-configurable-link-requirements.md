# ADR 018: Faculty choose which links a submission needs

**Status:** Accepted (Phase 8). Amends ADRs 013 and 015.

## Context

Phase 7 hard-coded a submission's links: a required repository URL, an optional demo and report.
Courses differ: SE courses want GitHub, AIML courses want a Drive folder, and a final
presentation may want only slides.

## Decision

- `common/links` defines `LinkType` (`GITHUB | DRIVE | DEMO | REPORT`) and the value object
  `LinkRequirement { required: LinkType[], optional: LinkType[] }` without overlap; any other type
  is not allowed.
- Each milestone has a requirement (default: GitHub required, demo and report optional), and the
  cycle has one for ideas (default: nothing required, GitHub and Drive optional). A pick from the
  faculty's list copies no links.
- Submissions and ideas store `links: { type, url }[]`, checked by `LinkRequirement.check`:
  `400 MISSING_REQUIRED_LINK`, `400 LINK_NOT_ALLOWED`, `400 INVALID_LINK` (a bad URL, or one type
  twice). An empty URL counts as absent.
- Each type's URL rule is a strategy in `LinkValidatorRegistry`: GitHub needs
  `https://github.com/<owner>/<repo>`, Drive needs `drive.google.com` or `docs.google.com`, demo
  and report need any `https` URL. Adding a type (Figma) is one name in `LINK_TYPES`, one
  validator class and one `register` call (Open/Closed).

## Why JSON instead of a table

A requirement is a small value read and written with its milestone, never queried on its own, so
JSON columns (`Milestone.linkRequirement`, `CourseProjectCycle.ideaLinkRequirement`,
`Submission.links`, `ProjectIdea.links`) keep the aggregate one row per milestone and the
versions immutable rows. The shape is validated in the domain when read and written, not only in
DTOs, because JSON has no schema of its own. A table would only pay off if links were searched
across submissions ("every Drive folder of batch 2023").

## Alternatives considered

- **Keep three URL columns and add more:** every new type needs a migration and a code change in
  every layer.
- **Free-form list of URLs:** no way to say which link is the repository, so no validation and no
  "required".
