import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { createCycle, getCycle, updateCycle } from "../api/cycles";
import { isoDate, localDateInput } from "../dates";
import { readableError } from "../errors";
import type { Cycle, CycleInput } from "../types";

export function CycleEditorPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const [form, setForm] = useState<CycleInput>({
    courseName: "",
    title: "",
    description: "",
    batchYear: year,
    semester: 1,
    academicYear: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
    submissionStartAt: localDateInput(),
    submissionDeadline: localDateInput(),
  });
  useEffect(() => {
    if (cycleId)
      getCycle(cycleId)
        .then((loaded) => {
          setCycle(loaded);
          setForm({
            courseName: loaded.courseName,
            title: loaded.title,
            description: loaded.description || "",
            batchYear: loaded.batchYear,
            semester: loaded.semester,
            academicYear: loaded.academicYear,
            submissionStartAt: localDateInput(loaded.submissionStartAt),
            submissionDeadline: localDateInput(loaded.submissionDeadline),
          });
        })
        .catch((caught) => setError(readableError(caught)));
  }, [cycleId]);
  const setField = (field: keyof CycleInput, value: string) =>
    setForm((current) => ({
      ...current,
      [field]:
        field === "batchYear" || field === "semester" ? Number(value) : value,
    }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      submissionStartAt: isoDate(form.submissionStartAt),
      submissionDeadline: isoDate(form.submissionDeadline),
    };
    try {
      const saved = cycle
        ? await updateCycle(cycle.id, payload)
        : await createCycle(payload);
      navigate(`/faculty/cycles/${saved.id}`);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };
  if (cycleId && !cycle && !error)
    return <p className="loading">Loading cycle…</p>;
  const published = cycle?.status === "PUBLISHED";
  return (
    <section className="form-page">
      <button
        className="back-button"
        onClick={() => navigate("/faculty/cycles")}
      >
        ← Back to cycles
      </button>
      <p className="eyebrow">{cycle ? "Edit cycle" : "New course cycle"}</p>
      <h1>{cycle ? "Refine the brief." : "Set the context."}</h1>
      <p className="page-lead">
        Define the academic runway once. Students will see the published version
        for their batch.
      </p>
      <form className="cycle-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Course name
            <input
              value={form.courseName}
              onChange={(event) => setField("courseName", event.target.value)}
              disabled={published}
              required
              maxLength={120}
            />
          </label>
          <label>
            Cycle title
            <input
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              disabled={published}
              required
              maxLength={120}
            />
          </label>
          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
          <label>
            Batch year
            <input
              type="number"
              value={form.batchYear}
              onChange={(event) => setField("batchYear", event.target.value)}
              disabled={published}
              min={1900}
              max={3000}
              required
            />
          </label>
          <label>
            Semester
            <input
              type="number"
              value={form.semester}
              onChange={(event) => setField("semester", event.target.value)}
              disabled={published}
              min={1}
              max={12}
              required
            />
          </label>
          <label>
            Academic year
            <input
              value={form.academicYear}
              onChange={(event) => setField("academicYear", event.target.value)}
              disabled={published}
              placeholder="2026-27"
              required
            />
          </label>
          <label>
            Submission opens
            <input
              type="datetime-local"
              value={form.submissionStartAt}
              onChange={(event) =>
                setField("submissionStartAt", event.target.value)
              }
              disabled={published}
              required
            />
          </label>
          <label>
            Submission deadline
            <input
              type="datetime-local"
              value={form.submissionDeadline}
              onChange={(event) =>
                setField("submissionDeadline", event.target.value)
              }
              required
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => navigate("/faculty/cycles")}
          >
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : cycle ? "Save changes" : "Create draft"}
          </button>
        </div>
      </form>
    </section>
  );
}
