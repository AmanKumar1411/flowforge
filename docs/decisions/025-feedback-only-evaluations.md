# ADR 025: Feedback-only evaluations in this version

**Status:** Accepted (Phase 10). Narrows ADR 020 while `EVALUATION_MARKS_ENABLED` is off.

## Decision

Marks are not part of this version. `EVALUATION_MARKS_ENABLED` (default `false`) decides it, in
`EvaluationService`, for every route and every role:

- a mark or a scale in a request is `400 MARKS_DISABLED`, and an evaluation needs feedback;
- no response carries `marks` or `maxMarks`, not even as null: the grading table, team evaluations, the dashboard's results, and the evaluation saved;
- no scale is needed to grade or to release;
- the grading view says `marksEnabled: false`, so the faculty screen shows feedback only, and students read "Feedback released on …".

The columns and the marks rules stay. With the flag on, behaviour is exactly that of ADR 020, and
every marks test runs that way. The demo and QA seeds write feedback only unless marks are switched
on (`EVALUATION_MARKS_ENABLED=true` for the demo seed, `QA_MARKS=1` for the QA seed).

## Why in the application layer

The UI hiding a field is not enough: an old browser tab, a script or the API docs would still show
marks. The views are built without the keys, so no controller or DTO can return them by mistake.
`test/evaluations-feedback-only.e2e.ts` and the QA sweep SEC-LEAK-1 check every route for both keys.
