export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not published";
}

export function localDateInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 86400000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isoDate(value: string) {
  return new Date(value).toISOString();
}
