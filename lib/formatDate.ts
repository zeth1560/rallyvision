/**
 * Format a date string in the user's timezone
 * @param dateString - ISO date string from the database (UTC)
 * @param timezone - IANA timezone identifier (default: America/Chicago)
 * @returns Formatted date string in the specified timezone
 */
export function formatDateInTimezone(
  dateString: string,
  timezone: string = 'America/Chicago'
): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (error) {
    return '—';
  }
}
