// Dates are shown in the viewer's own time zone, spelled out so they cannot be misread
// ("Tue, 4 Nov 2026 · 11:59 PM", never "04/11/2026"), and sent to the API as ISO-8601 in UTC.

const DAY_PARTS = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function dayParts(date: Date) {
  const parts = Object.fromEntries(
    DAY_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday,
    day: parts.day,
    month: parts.month,
    year: parts.year,
  };
}

/** "Tue, 4 Nov 2026 · 11:59 PM" */
export function formatDate(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  const { weekday, day, month, year } = dayParts(date);
  return `${weekday}, ${day} ${month} ${year} · ${TIME.format(date)}`;
}

/** "Tue, 4 Nov 2026", for a day without a time. */
export function formatFullDay(value: string | Date) {
  const { weekday, day, month, year } = dayParts(new Date(value));
  return `${weekday}, ${day} ${month} ${year}`;
}

/** "Tue, 4 Nov", with the year only when it is not this year: for summaries and timelines. */
export function formatDay(value: string) {
  const date = new Date(value);
  const { weekday, day, month, year } = dayParts(date);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${weekday}, ${day} ${month}${sameYear ? "" : ` ${year}`}`;
}

/** A `datetime-local` input value ("2026-11-04T23:59") in the viewer's time zone. */
export function localDateInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 86400000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** An input value to what the API takes: ISO-8601 with its time zone (UTC, "Z"). */
export function isoDate(value: string) {
  return new Date(value).toISOString();
}
