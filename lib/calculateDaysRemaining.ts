/**
 * Calculate the minimum days remaining before clips are deleted
 * @param clips - Array of clips with created_at timestamps
 * @param retentionDays - Number of days clips are retained (default: 30)
 * @returns Number of days remaining (minimum across all clips, or 0 if expired)
 */
export function calculateMinDaysRemaining(
  clips: Array<{ created_at: string | null }>,
  retentionDays: number = 30
): number {
  if (!clips || clips.length === 0) {
    return retentionDays;
  }

  // Find the oldest clip (earliest created_at)
  let oldestCreatedAt: string | null = null;

  for (const clip of clips) {
    if (clip.created_at) {
      if (!oldestCreatedAt || clip.created_at < oldestCreatedAt) {
        oldestCreatedAt = clip.created_at;
      }
    }
  }

  if (!oldestCreatedAt) {
    return retentionDays;
  }

  const createdDate = new Date(oldestCreatedAt);
  const now = new Date();
  const daysPassed = Math.floor(
    (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemaining = retentionDays - daysPassed;

  return Math.max(0, daysRemaining);
}
