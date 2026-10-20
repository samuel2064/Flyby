// A crowd report that accumulates this many abuse flags is excluded from all
// traveler-facing wait math (consensus, accuracy, history, stats, forecasts,
// SSE "latest", notification baselines). Flags are deduped per session, so
// reaching the threshold requires separate travelers to object.
export const FLAG_HIDE_THRESHOLD = 3;

// Prisma `where` fragment: only reports that have NOT crossed the flag
// threshold. Spread into every waitTime query that feeds traffic math.
export const VISIBLE_REPORT_WHERE = { flagCount: { lt: FLAG_HIDE_THRESHOLD } } as const;

export function computeAccuracy(waitTimes: Array<{ reportedAt: Date }>): number {
  if (!waitTimes || waitTimes.length === 0) return 0;

  const now = Date.now();

  const recentReports = waitTimes.filter((wt) => {
    const ageHours = (now - new Date(wt.reportedAt).getTime()) / (1000 * 60 * 60);
    // Allow epsilon for floating-point precision at 6-hour boundary (1e-6 hours = 3.6ms)
    return ageHours <= 6 + 1e-6;
  });

  if (recentReports.length === 0) return 0;

  const sampleScore = Math.min(60, recentReports.length * 15);

  const mostRecent = recentReports.reduce((latest, current) =>
    new Date(current.reportedAt) > new Date(latest.reportedAt) ? current : latest
  );
  const ageMinutes = (now - new Date(mostRecent.reportedAt).getTime()) / (1000 * 60);

  let recencyScore: number;
  if (ageMinutes < 30) recencyScore = 40;
  else if (ageMinutes < 60) recencyScore = 30;
  else if (ageMinutes < 120) recencyScore = 20;
  else if (ageMinutes < 360) recencyScore = 10;
  else recencyScore = 5;

  return Math.min(100, sampleScore + recencyScore);
}

export function computeConsensus(
  waitTimes: Array<{ minutes: number; reportedAt: Date }>
): number | null {
  if (!waitTimes || waitTimes.length === 0) return null;

  const now = Date.now();
  const recentReports = waitTimes.filter((wt) => {
    const ageHours = (now - new Date(wt.reportedAt).getTime()) / (1000 * 60 * 60);
    return ageHours <= 6;
  });

  if (recentReports.length === 0) return null;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const wt of recentReports) {
    const ageHours = (now - new Date(wt.reportedAt).getTime()) / (1000 * 60 * 60);
    const weight = 1 / (ageHours + 0.1);
    totalWeight += weight;
    weightedSum += wt.minutes * weight;
  }

  return Math.round(weightedSum / totalWeight);
}
