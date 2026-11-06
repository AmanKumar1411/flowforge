| Profile | VUs | Requests | Throughput | All p50 / p95 / p99 | Reads p95 | Writes p95 | Failed | 5xx + dropped | Submissions k6 / DB | API CPU max | API RSS max | DB connections max | Probe p95 | Thresholds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| peak | 3000 | 1,244,459 | 663/s | 1.74 s / 4.64 s / 6.79 s | 4.65 s | 6.07 s | 0.0021% | 25 | 2952 / 2952 ✓ | 273% | 981 MB | 42 (13 active) | 4.99 s | fail |
| spike | 1500 | 59,541 | 121/s | 5 ms / 12 ms / 19 ms | 10 ms | 20 ms | 0.00% | 0 | 0 / 0 ✓ | 104% | 559 MB | 41 (5 active) | 11 ms | pass |

| Endpoint | peak p50 / p95 / p99 | spike p50 / p95 / p99 |
| --- | --- | --- |
| `POST submission` | 3.52 s / 6.31 s / 8.47 s | – |
| `GET /course-cycles/:id/milestones/:m/submissions` | 3.44 s / 6.07 s / 8.53 s | 17 ms / 29 ms / 40 ms |
| `GET /me/dashboard` | 2.79 s / 5.49 s / 7.42 s | 5 ms / 11 ms / 18 ms |
| `GET /teams/:id/idea` | 2.99 s / 5.35 s / 7.52 s | – |
| `GET evaluations` | 2.92 s / 5.25 s / 7.33 s | 4 ms / 8 ms / 13 ms |
| `PUT evaluation` | 2.86 s / 4.98 s / 6.55 s | 11 ms / 20 ms / 28 ms |
| `GET /teams/:id/milestones/:m/submissions` | 2.59 s / 4.67 s / 6.69 s | – |
| `GET grading` | 2.08 s / 4.08 s / 5.81 s | 11 ms / 20 ms / 31 ms |
| `GET /teams/mine` | 1.34 s / 2.53 s / 3.97 s | – |
| `GET /course-cycles/:id` | 1.00 s / 2.23 s / 3.50 s | 2 ms / 4 ms / 8 ms |
| `GET /me/upcoming` | 969 ms / 2.07 s / 3.31 s | – |
| `GET /course-cycles/my` | 1.02 s / 2.02 s / 3.23 s | 2 ms / 4 ms / 10 ms |
| `POST /auth/refresh` | 350 ms / 782 ms / 1.58 s | 5 ms / 10 ms / 13 ms |
| `POST /auth/dev-login` | 13 ms / 712 ms / 1.69 s | 6 ms / 10 ms / 12 ms |

- **peak**: unexpected responses 26 (first two per VU: POST /auth/dev-login 500 ×1, POST /auth/refresh 401 ×1, POST /auth/refresh 500 ×21, POST submission 500 ×3); connection failures none; refresh failures 0.42%; evaluation conflicts (409) 3; submissions refused 3
- **spike**: unexpected responses 0 (first two per VU: none); connection failures none; refresh failures 0.00%; evaluation conflicts (409) 0; submissions refused 0

peak per minute (10 s windows; max 1067 requests/s):
| Minute | VUs | Requests/s | p95 |
| --- | --- | --- | --- |
| 1 | 343 | 209 | 10 ms |
| 2 | 643 | 388 | 8 ms |
| 3 | 943 | 565 | 10 ms |
| 4 | 1,243 | 736 | 18 ms |
| 5 | 1,543 | 912 | 72 ms |
| 6 | 1,843 | 904 | 1.03 s |
| 7 | 2,143 | 930 | 1.76 s |
| 8 | 2,443 | 659 | 3.03 s |
| 9 | 2,743 | 844 | 3.84 s |
| 10 | 3,000 | 635 | 7.27 s |
| 14 | 3,000 | 732 | 4.40 s |
| 18 | 3,000 | 655 | 4.58 s |
| 22 | 3,000 | 700 | 3.54 s |
| 26 | 3,000 | 677 | 4.75 s |
| 30 | 2,918 | 693 | 4.14 s |

spike per minute (10 s windows; max 259 requests/s):
| Minute | VUs | Requests/s | p95 |
| --- | --- | --- | --- |
| 1 | 0 | 7 | 21 ms |
| 2 | 0 | 7 | 19 ms |
| 3 | 0 | 7 | 18 ms |
| 4 | 1,128 | 222 | 9 ms |
| 5 | 1,500 | 252 | 9 ms |
| 6 | 1,500 | 248 | 9 ms |
| 7 | 1,500 | 244 | 11 ms |
| 8 | 2 | 0 | – |

peak pg_stat_statements (top 5 by total time):
| Calls | Total | Mean | Max | Query |
| --- | --- | --- | --- | --- |
| 1,058,254 | 67.17 s | 0.06 ms | 93 ms | `SELECT User.id, User.name, User.email FROM User WHERE User.id IN ($1 /*, ... */) OFFSET $2…` |
| 1,062,427 | 52.10 s | 0.05 ms | 102 ms | `SELECT TeamMember.teamId, TeamMember.userId, TeamMember.cycleId, TeamMember.addedById, TeamMember.addedAt FROM TeamMembe…` |
| 420,969 | 43.09 s | 0.10 ms | 108 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 1,223,694 | 42.39 s | 0.03 ms | 97 ms | `SELECT Milestone.id, Milestone.cycleId, Milestone.position, Milestone.name, Milestone.description, Milestone.submissionO…` |
| 1,233,998 | 38.30 s | 0.03 ms | 95 ms | `SELECT User.id, User.role::text, User.status::text, User.tokenVersion, User.batchYear, User.email FROM User WHERE (User.…` |

spike pg_stat_statements (top 5 by total time):
| Calls | Total | Mean | Max | Query |
| --- | --- | --- | --- | --- |
| 55,186 | 1.75 s | 0.03 ms | 2 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 71,304 | 1.12 s | 0.02 ms | 2 ms | `SELECT User.id, User.name, User.email FROM User WHERE User.id IN ($1 /*, ... */) OFFSET $2…` |
| 55,186 | 1.01 s | 0.02 ms | 3 ms | `SELECT Team.id, Team.cycleId, Team.name, Team.leaderId, Team.origin::text, Team.createdAt, Team.updatedAt FROM Team WH…` |
| 49,326 | 859 ms | 0.02 ms | 1 ms | `SELECT Evaluation.id, Evaluation.milestoneId, Evaluation.teamId, Evaluation.cycleId, Evaluation.marks, Evaluation.feedba…` |
| 84,837 | 854 ms | 0.01 ms | 2 ms | `SELECT Milestone.id, Milestone.cycleId, Milestone.position, Milestone.name, Milestone.description, Milestone.submissionO…` |
