/**
 * Semesters as the university runs them: odd semesters (1, 3, 5, 7) from
 * August to December, even ones (2, 4, 6, 8) from January to May. A batch is
 * named after its admission year, so semester n of batch B starts in the
 * academic year that begins in August of B + floor((n − 1) / 2).
 */

export const SEMESTERS = 8;

export interface SemesterTerm {
  semester: number;
  /** "Aug–Dec" or "Jan–May". */
  months: string;
  /** The calendar year the term falls in. */
  year: number;
  /** August to May, "2026-27". */
  academicYear: string;
  /** The term's first and last local days, "YYYY-MM-DD". */
  firstDay: string;
  lastDay: string;
  /** "Aug–Dec 2026" */
  label: string;
}

export function semesterTerm(batchYear: number, semester: number): SemesterTerm {
  const august = batchYear + Math.floor((semester - 1) / 2);
  const odd = semester % 2 === 1;
  const year = odd ? august : august + 1;
  const months = odd ? "Aug–Dec" : "Jan–May";
  return {
    semester,
    months,
    year,
    academicYear: `${august}-${String((august + 1) % 100).padStart(2, "0")}`,
    firstDay: odd ? `${year}-08-01` : `${year}-01-01`,
    lastDay: odd ? `${year}-12-31` : `${year}-05-31`,
    label: `${months} ${year}`,
  };
}

/** The semester a batch is in on a day (the next one in June and July), from 1 to 8. */
export function currentSemester(batchYear: number, today: Date = new Date()) {
  const years = today.getFullYear() - batchYear;
  const semester = today.getMonth() <= 4 ? years * 2 : years * 2 + 1;
  return Math.min(SEMESTERS, Math.max(1, semester));
}
