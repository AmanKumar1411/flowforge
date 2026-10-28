import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addCatalogIdea,
  listCatalog,
  removeCatalogIdea,
  updateCatalogIdea,
} from "../api/ideas";
import { readableError } from "../errors";
import type { CatalogIdea, CatalogIdeaContent, Cycle } from "../types";

const LIMITS = { title: 120, description: 4000, link: 500 };

/**
 * The faculty's list of ideas for a cycle. Teams either pick one (any number
 * of teams can pick the same idea) or propose their own. A picked idea stays
 * in the list; editing it changes only later picks.
 */
export function FacultyCatalogSection({ cycle }: { cycle: Cycle }) {
  const [ideas, setIdeas] = useState<CatalogIdea[] | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState("");
  const closed = cycle.status === "CLOSED";

  const load = useCallback(() => {
    listCatalog(cycle.id)
      .then(setIdeas)
      .catch((caught) => setError(readableError(caught)));
  }, [cycle.id]);
  useEffect(load, [load]);

  const save = async (content: CatalogIdeaContent) => {
    if (editingId === "new") await addCatalogIdea(cycle.id, content);
    else if (editingId) await updateCatalogIdea(cycle.id, editingId, content);
    setEditingId(null);
    load();
  };

  const remove = async (idea: CatalogIdea) => {
    setError("");
    try {
      await removeCatalogIdea(cycle.id, idea.id);
      load();
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  return (
    <section className="team-panel" aria-labelledby="catalog-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Your idea list</p>
          <h2 id="catalog-heading">
            {ideas
              ? `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"} offered`
              : "Loading…"}
          </h2>
        </div>
        {!closed && editingId === null && (
          <button
            className="dark-button compact"
            onClick={() => setEditingId("new")}
          >
            + Add an idea
          </button>
        )}
      </div>
      <p className="field-hint">
        Teams pick one of these ideas or propose their own. A pick is approved
        at once, and any number of teams can pick the same idea. Teams keep
        what they picked, so a picked idea cannot be removed.
      </p>
      {error && <p className="form-error">{error}</p>}
      {editingId === "new" && (
        <CatalogIdeaForm
          initial={null}
          saveLabel="Add idea"
          onSave={save}
          onCancel={() => setEditingId(null)}
        />
      )}
      {ideas && ideas.length === 0 && editingId !== "new" && (
        <p className="muted">
          No ideas yet. Without a list, every team proposes its own idea.
        </p>
      )}
      {ideas && ideas.length > 0 && (
        <ul className="catalog-list" aria-label="Offered ideas">
          {ideas.map((idea) =>
            editingId === idea.id ? (
              <li key={idea.id}>
                <CatalogIdeaForm
                  initial={idea}
                  saveLabel="Save changes"
                  onSave={save}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={idea.id}>
                <strong>{idea.title}</strong>
                <p>{idea.description}</p>
                {idea.link && (
                  <a href={idea.link} target="_blank" rel="noopener noreferrer">
                    {idea.link}
                  </a>
                )}
                <p className="field-hint">
                  {idea.pickCount === 0
                    ? "No team has picked it yet"
                    : `Picked by ${idea.pickCount} ${idea.pickCount === 1 ? "team" : "teams"}`}
                </p>
                {!closed && editingId === null && (
                  <div className="row-actions">
                    <button
                      className="text-button"
                      aria-label={`Edit ${idea.title}`}
                      onClick={() => setEditingId(idea.id)}
                    >
                      Edit
                    </button>
                    {idea.pickCount === 0 && (
                      <button
                        className="text-button"
                        aria-label={`Remove ${idea.title}`}
                        onClick={() => void remove(idea)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function CatalogIdeaForm({
  initial,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: CatalogIdeaContent | null;
  saveLabel: string;
  onSave: (content: CatalogIdeaContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        link: link.trim() || null,
      });
    } catch (caught) {
      setError(readableError(caught));
      setBusy(false);
    }
  };

  return (
    <form className="team-editor idea-form" onSubmit={submit}>
      <label>
        Idea title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={LIMITS.title}
          required
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={LIMITS.description}
          rows={4}
          placeholder="What the project is about and what you expect from the team"
          required
        />
      </label>
      <label>
        Link (optional)
        <input
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          maxLength={LIMITS.link}
          placeholder="https://… a brief, dataset or reference"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : saveLabel}
        </button>
      </div>
    </form>
  );
}
