| Profile | VUs | Requests | Throughput | All p50 / p95 / p99 | Reads p95 | Writes p95 | Failed | 5xx + dropped | Submissions k6 / DB | API CPU max | API RSS max | DB connections max | Probe p95 | Thresholds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| normal | 500 | 329,124 | 258/s | 5 ms / 10 ms / 17 ms | 10 ms | 20 ms | 0.00% | 0 | 1547 / 1547 ✓ | 75% | 308 MB | 11 (7 active) | 10 ms | pass |
| peak | 3000 | 1,045,601 | 557/s | 2.09 s / 5.94 s / 6.74 s | 5.94 s | 6.18 s | 0.0004% | 4 | 2383 / 2383 ✓ | 195% | 651 MB | 11 (6 active) | 4.05 s | fail |
| spike | 1500 | 59,809 | 208/s | 5 ms / 15 ms / 28 ms | 15 ms | 29 ms | 0.00% | 0 | 0 / 0 ✓ | 88% | 325 MB | 11 (5 active) | 14 ms | pass |
| soak | 300 | 661,439 | 179/s | 5 ms / 12 ms / 18 ms | 12 ms | 23 ms | 0.00% | 0 | 3120 / 3120 ✓ | 72% | 319 MB | 11 (5 active) | 9 ms | pass |

| Endpoint | normal p50 / p95 / p99 | peak p50 / p95 / p99 | spike p50 / p95 / p99 | soak p50 / p95 / p99 |
| --- | --- | --- | --- | --- |
| `GET grading` | 25 ms / 39 ms / 51 ms | 6.16 s / 7.60 s / 8.77 s | 26 ms / 45 ms / 56 ms | 30 ms / 49 ms / 59 ms |
| `GET /course-cycles/:id/milestones/:m/submissions` | 19 ms / 31 ms / 44 ms | 5.40 s / 6.71 s / 7.72 s | 22 ms / 48 ms / 63 ms | 21 ms / 63 ms / 76 ms |
| `GET /teams/:id/milestones/:m/submissions` | 6 ms / 12 ms / 17 ms | 5.33 s / 6.66 s / 7.71 s | – | 7 ms / 13 ms / 18 ms |
| `POST submission` | 10 ms / 20 ms / 30 ms | 5.06 s / 6.39 s / 7.37 s | – | 11 ms / 24 ms / 33 ms |
| `GET /teams/:id/idea` | 5 ms / 10 ms / 14 ms | 3.92 s / 4.98 s / 5.72 s | – | 6 ms / 11 ms / 17 ms |
| `GET evaluations` | 5 ms / 9 ms / 14 ms | 3.89 s / 4.89 s / 5.66 s | 5 ms / 12 ms / 22 ms | 6 ms / 10 ms / 14 ms |
| `PUT evaluation` | 10 ms / 20 ms / 28 ms | 3.25 s / 4.08 s / 4.65 s | 13 ms / 29 ms / 40 ms | 10 ms / 17 ms / 23 ms |
| `GET /me/dashboard` | 6 ms / 12 ms / 18 ms | 3.11 s / 4.05 s / 4.82 s | 6 ms / 15 ms / 26 ms | 7 ms / 15 ms / 21 ms |
| `GET /teams/mine` | 2 ms / 5 ms / 8 ms | 1.43 s / 1.89 s / 2.22 s | – | 3 ms / 6 ms / 9 ms |
| `GET /course-cycles/:id` | 2 ms / 4 ms / 8 ms | 1.07 s / 1.44 s / 1.71 s | 2 ms / 5 ms / 9 ms | 2 ms / 6 ms / 9 ms |
| `GET /me/upcoming` | 2 ms / 5 ms / 9 ms | 1.06 s / 1.43 s / 1.71 s | – | 3 ms / 6 ms / 9 ms |
| `GET /course-cycles/my` | 2 ms / 4 ms / 7 ms | 1.06 s / 1.42 s / 1.69 s | 2 ms / 5 ms / 10 ms | 2 ms / 5 ms / 9 ms |
| `POST /auth/refresh` | 5 ms / 12 ms / 18 ms | 700 ms / 939 ms / 1.14 s | 4 ms / 8 ms / 12 ms | 6 ms / 13 ms / 18 ms |
| `POST /auth/dev-login` | 6 ms / 15 ms / 20 ms | 85 ms / 355 ms / 399 ms | 4 ms / 8 ms / 15 ms | 7 ms / 16 ms / 19 ms |

- **normal**: unexpected responses 0 (first two per VU: none); connection failures none; refresh failures 0.00%; evaluation conflicts (409) 0; submissions refused 0
- **peak**: unexpected responses 0 (first two per VU: none); connection failures POST /auth/refresh connection reset by peer ×3, POST /teams/:id/milestones/:id/submissions connection reset by peer ×1; refresh failures 0.0635%; evaluation conflicts (409) 5; submissions refused 1
- **spike**: unexpected responses 0 (first two per VU: none); connection failures none; refresh failures 0.00%; evaluation conflicts (409) 0; submissions refused 0
- **soak**: unexpected responses 0 (first two per VU: none); connection failures none; refresh failures 0.00%; evaluation conflicts (409) 0; submissions refused 0

normal per minute (10 s windows; max 317 requests/s):
| Minute | VUs | Requests/s | p95 |
| --- | --- | --- | --- |
| 1 | 114 | 74 | 18 ms |
| 2 | 214 | 131 | 15 ms |
| 3 | 314 | 186 | 11 ms |
| 4 | 414 | 250 | 10 ms |
| 5 | 500 | 305 | 9 ms |
| 6 | 500 | 303 | 9 ms |
| 7 | 500 | 309 | 10 ms |
| 8 | 500 | 314 | 9 ms |
| 9 | 500 | 299 | 9 ms |
| 10 | 500 | 307 | 10 ms |
| 14 | 500 | 308 | 9 ms |
| 18 | 500 | 298 | 9 ms |

peak per minute (10 s windows; max 674 requests/s):
| Minute | VUs | Requests/s | p95 |
| --- | --- | --- | --- |
| 1 | 343 | 212 | 10 ms |
| 2 | 648 | 390 | 11 ms |
| 3 | 943 | 568 | 17 ms |
| 4 | 1,243 | 650 | 386 ms |
| 5 | 1,543 | 655 | 1.38 s |
| 6 | 1,843 | 626 | 1.91 s |
| 7 | 2,143 | 613 | 2.90 s |
| 8 | 2,443 | 607 | 4.31 s |
| 9 | 2,743 | 596 | 4.61 s |
| 10 | 3,000 | 625 | 5.30 s |
| 14 | 3,000 | 607 | 5.43 s |
| 18 | 3,000 | 562 | 6.89 s |
| 22 | 3,000 | 489 | 6.46 s |
| 26 | 3,000 | 611 | 5.06 s |
| 30 | 2,928 | 586 | 5.37 s |

spike per minute (10 s windows; max 300 requests/s):
| Minute | VUs | Requests/s | p95 |
| --- | --- | --- | --- |
| 1 | 1,500 | 246 | 18 ms |
| 2 | 1,500 | 250 | 15 ms |
| 3 | 1,500 | 242 | 13 ms |
| 4 | 1,354 | 202 | 15 ms |

soak per minute (10 s windows; max 195 requests/s):
| Minute | VUs | Requests/s | p95 |
| --- | --- | --- | --- |
| 1 | 300 | 187 | 12 ms |
| 2 | 300 | 175 | 12 ms |
| 3 | 300 | 179 | 12 ms |
| 4 | 300 | 178 | 12 ms |
| 5 | 300 | 178 | 12 ms |
| 6 | 300 | 182 | 12 ms |
| 7 | 300 | 176 | 11 ms |
| 8 | 300 | 182 | 12 ms |
| 9 | 300 | 170 | 13 ms |
| 10 | 300 | 181 | 11 ms |
| 14 | 300 | 187 | 11 ms |
| 18 | 300 | 175 | 13 ms |
| 22 | 300 | 181 | 11 ms |
| 26 | 300 | 182 | 12 ms |
| 30 | 300 | 187 | 11 ms |
| 34 | 300 | 179 | 12 ms |
| 38 | 300 | 177 | 12 ms |
| 42 | 300 | 182 | 12 ms |
| 46 | 300 | 176 | 12 ms |
| 50 | 300 | 175 | 12 ms |
| 54 | 300 | 180 | 11 ms |
| 58 | 300 | 178 | 12 ms |

normal pg_stat_statements (top 5 by total time):
| Calls | Total | Mean | Max | Query |
| --- | --- | --- | --- | --- |
| 579,097 | 4.50 s | 0.01 ms | 1 ms | `SELECT Milestone.id, Milestone.cycleId, Milestone.position, Milestone.name, Milestone.description, Milestone.submissionO…` |
| 107,206 | 3.05 s | 0.03 ms | 1 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 241,549 | 3.05 s | 0.01 ms | 6 ms | `SELECT User.id, User.name, User.email FROM User WHERE User.id IN ($1 /*, ... */) OFFSET $2…` |
| 473,777 | 2.80 s | 0.01 ms | 1 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 139,944 | 2.35 s | 0.02 ms | 2 ms | `SELECT Team.id, Team.cycleId, Team.name, Team.leaderId, Team.origin::text, Team.createdAt, Team.updatedAt FROM Team WH…` |

peak pg_stat_statements (top 5 by total time):
| Calls | Total | Mean | Max | Query |
| --- | --- | --- | --- | --- |
| 1,785,339 | 15.69 s | 0.01 ms | 7 ms | `SELECT Milestone.id, Milestone.cycleId, Milestone.position, Milestone.name, Milestone.description, Milestone.submissionO…` |
| 879,994 | 14.74 s | 0.02 ms | 3 ms | `SELECT User.id, User.name, User.email FROM User WHERE User.id IN ($1 /*, ... */) OFFSET $2…` |
| 884,227 | 10.85 s | 0.01 ms | 5 ms | `SELECT TeamMember.teamId, TeamMember.userId, TeamMember.cycleId, TeamMember.addedById, TeamMember.addedAt FROM TeamMembe…` |
| 1,435,251 | 9.83 s | 0.01 ms | 3 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 357,287 | 9.27 s | 0.03 ms | 3 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |

spike pg_stat_statements (top 5 by total time):
| Calls | Total | Mean | Max | Query |
| --- | --- | --- | --- | --- |
| 55,388 | 1.41 s | 0.03 ms | 1 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 71,565 | 968 ms | 0.01 ms | 1 ms | `SELECT User.id, User.name, User.email FROM User WHERE User.id IN ($1 /*, ... */) OFFSET $2…` |
| 114,712 | 947 ms | 0.01 ms | 1 ms | `SELECT Milestone.id, Milestone.cycleId, Milestone.position, Milestone.name, Milestone.description, Milestone.submissionO…` |
| 55,388 | 776 ms | 0.01 ms | 0 ms | `SELECT Team.id, Team.cycleId, Team.name, Team.leaderId, Team.origin::text, Team.createdAt, Team.updatedAt FROM Team WH…` |
| 71,565 | 735 ms | 0.01 ms | 0 ms | `SELECT TeamMember.teamId, TeamMember.userId, TeamMember.cycleId, TeamMember.addedById, TeamMember.addedAt FROM TeamMembe…` |

soak pg_stat_statements (top 5 by total time):
| Calls | Total | Mean | Max | Query |
| --- | --- | --- | --- | --- |
| 1,145,516 | 10.92 s | 0.01 ms | 2 ms | `SELECT Milestone.id, Milestone.cycleId, Milestone.position, Milestone.name, Milestone.description, Milestone.submissionO…` |
| 155,808 | 8.95 s | 0.06 ms | 4 ms | `SELECT Submission.id, Submission.teamId, Submission.cycleId, Submission.milestoneId, Submission.version, Submission.link…` |
| 216,477 | 7.78 s | 0.04 ms | 4 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
| 460,135 | 7.04 s | 0.02 ms | 1 ms | `SELECT User.id, User.name, User.email FROM User WHERE User.id IN ($1 /*, ... */) OFFSET $2…` |
| 953,179 | 6.83 s | 0.01 ms | 3 ms | `SELECT CourseProjectCycle.id, CourseProjectCycle.courseName, CourseProjectCycle.title, CourseProjectCycle.description, C…` |
