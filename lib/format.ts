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