/** A save of one team's evaluation (ADR 020). `expectedVersion` is required once the evaluation exists. */
export interface SaveEvaluationCommand {
  marks?: number | null;
  feedback?: string | null;
  expectedVersion?: number;
}
