# FlowForge low-level design

The design of FlowForge, verified against its code. Each diagram has a title, one line on what it shows, the diagram, and the paths it was checked against. Where the code doesn't do
something, the documents say so rather than draw it.

## The ten criteria

| # | Criterion | Document | What's in it |
| --- | --- | --- | --- |
| 1 | Requirements | [01-requirements.md](01-requirements.md) | Problem, V1 scope, actors, 68 functional requirements, 9 non-functional with measured numbers, use-case diagram, 6 specs, traceability |
| 2 | Class diagrams | [02-class-diagrams.md](02-class-diagrams.md) | Domain model, why each composition and aggregation, one diagram per module, the `DomainError` hierarchy |
| 3 | Object-oriented design | [03-oop.md](03-oop.md) | The four pillars with real examples, abstract classes versus interfaces, weak spots found |
| 4 | SOLID | [04-solid.md](04-solid.md) | Each principle applied, a violation avoided, and Liskov proved by contract tests |
| 5 | Design patterns | [05-design-patterns.md](05-design-patterns.md) | Twelve patterns verified in the code, and those not used, with reasons |
| 6 | Sequence and activity | [06-sequence-activity.md](06-sequence-activity.md) | Sequence diagrams for eight flows, three activity diagrams, six state diagrams |
| 7 | API and interfaces | [07-api-interfaces.md](07-api-interfaces.md) | Layers and the dependency rule, all 66 routes, the error contract, idempotency for every write |
| 8 | Database | [08-database.md](08-database.md) | Generated ER diagrams, every table and index, class-to-table mapping, normalization, locking, migrations |
| 9 | Errors and edge cases | [09-errors-edge-cases.md](09-errors-edge-cases.md) | Validation layers, and each edge case with its behaviour, error code and test |
| 10 | Working implementation | [10-implementation.md](10-implementation.md) | How to run it, test counts, QA and load results, the live URL, and a design-to-code table |

## Generated files

Don't edit these by hand.

| File | Made by | Check it's current |
| --- | --- | --- |
| [generated/erd.md](generated/erd.md) | `npm run docs:erd` | `npm run docs:erd -- --check` |
| [generated/ports.md](generated/ports.md) | `npm run docs:ports` | `npm run docs:ports -- --check` |

Run them from `backend/`.

## How these documents are checked

| Check | Command, from `backend/` | What it proves |
| --- | --- | --- |
| Cited paths and excerpts | `npm run docs:check` | Every link, path, class name and error code exists, and each code excerpt is an exact copy of a file |
| Ports match the diagrams | `npm run docs:ports -- --check` | Doc 2 shows every abstract class and production implementation |
| ER diagrams are current | `npm run docs:erd -- --check` | The diagrams match `backend/prisma/schema.prisma` |
| Diagrams render | `docs/design/scripts/render-mermaid.sh` | Every Mermaid block renders with `@mermaid-js/mermaid-cli` |
| Layers | `npm run lint`, and `backend/test/layering.e2e.ts` | Nothing outside `presentation/` imports it |

## Terms

| Term | Meaning |
| --- | --- |
| **Cycle** or **project** | One course's project. The code says cycle; the screens say project |
| **Milestone** | A checkpoint of a cycle: a submission window and an evaluation day |
| **Port** | An abstract class that a service depends on, implemented in `infrastructure/` |
| **Adapter** | A port's implementation that calls another module's service |
| **Contract test** | One suite that runs against every implementation of a port |
| **H1 to H16** | The fixes of Phase 10, in `docs/analysis/phase10-hardening-baseline.md` |
| **BUG-n, SEC-Fn** | Findings of the first QA pass, in `docs/testing/report.md` |
| **CON-n, SEC-…, RES-n, KEY-n, E2E-…** | QA tests, named in `tests/` |
| **ADR n** | A decision record in `docs/decisions/` |
