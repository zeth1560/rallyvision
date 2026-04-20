function formatClipTime(recordedAt: string) {
  const match = recordedAt.match(/(\d{2}):(\d{2}):(\d{2})/);

  if (!match) {
    return recordedAt;
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const seconds = match[3];

  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${hours}:${minutes}:${seconds} ${suffix}`;
}

function formatDuration(seconds: number) {
  const duration = Math.max(0, Math.round(seconds));
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const secs = duration % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export { formatClipTime, formatDuration };