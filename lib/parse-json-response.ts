export async function parseJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.status === 504 || response.status === 502) {
      throw new Error(
        'The server timed out while preparing the video. Refresh this page in a few minutes to check whether submission completed.'
      );
    }

    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      throw new Error(
        `Received an HTML error page instead of JSON (HTTP ${response.status}). Refresh this page in a few minutes to check submission status.`
      );
    }

    throw new Error(
      `Unexpected response from server (HTTP ${response.status}). Refresh this page to check submission status.`
    );
  }
}
