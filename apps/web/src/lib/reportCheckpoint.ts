// Resolve which checkpoint a report will be filed against.
// The report sheet stays mounted while it opens and closes, so a pick from a
// previously viewed airport must never leak into the current one: fall back
// to the first configured option whenever the stored pick is not valid.
export function effectiveCheckpointPick(picked: string, options: string[]): string {
  return options.includes(picked) ? picked : (options[0] ?? '')
}

// A report can only be filed against a non-blank checkpoint name. Guards
// both picker mode with no configured checkpoints and fixed-checkpoint mode
// receiving an empty string.
export function canSubmitReport(checkpoint: string): boolean {
  return checkpoint.trim().length > 0
}
