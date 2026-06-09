function getConfiguredBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ''
  ).replace(/\/$/, '');
}

export type PlayerTroveEmailConfigIssue =
  | 'missing_resend_api_key'
  | 'missing_email_from'
  | 'missing_playertrove_token_secret'
  | 'missing_base_url';

const CONFIG_ISSUE_LABELS: Record<PlayerTroveEmailConfigIssue, string> = {
  missing_resend_api_key: 'RESEND_API_KEY is not set',
  missing_email_from: 'EMAIL_FROM is not set',
  missing_playertrove_token_secret: 'PLAYERTROVE_TOKEN_SECRET is not set',
  missing_base_url:
    'NEXT_PUBLIC_BASE_URL (or NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL) is not set',
};

export function isProductionDeploy() {
  return process.env.VERCEL_ENV === 'production';
}

export function getPlayerTroveEmailConfigIssues(): PlayerTroveEmailConfigIssue[] {
  const issues: PlayerTroveEmailConfigIssue[] = [];

  if (!process.env.RESEND_API_KEY?.trim()) {
    issues.push('missing_resend_api_key');
  }

  if (!process.env.EMAIL_FROM?.trim()) {
    issues.push('missing_email_from');
  }

  if (!process.env.PLAYERTROVE_TOKEN_SECRET?.trim()) {
    issues.push('missing_playertrove_token_secret');
  }

  const hasExplicitBaseUrl = Boolean(
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim()
  );

  if (!hasExplicitBaseUrl && process.env.VERCEL_ENV !== 'development') {
    issues.push('missing_base_url');
  }

  return issues;
}

export function describePlayerTroveEmailConfigIssues(
  issues: PlayerTroveEmailConfigIssue[]
) {
  return issues.map((issue) => CONFIG_ISSUE_LABELS[issue]).join('; ');
}

export function classifyPlayerTroveEmailError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (message.includes('PLAYERTROVE_TOKEN_SECRET is not configured')) {
    return 'missing_token_secret';
  }

  if (
    getPlayerTroveEmailConfigIssues().some(
      (issue) => issue === 'missing_resend_api_key' || issue === 'missing_email_from'
    )
  ) {
    return 'missing_email_config';
  }

  if (
    normalized.includes('testing emails') ||
    normalized.includes('only send') && normalized.includes('your own email')
  ) {
    return 'resend_sandbox_recipient';
  }

  if (
    normalized.includes('domain') &&
    (normalized.includes('verify') || normalized.includes('not verified'))
  ) {
    return 'resend_domain_unverified';
  }

  if (normalized.includes('api key') || normalized.includes('unauthorized')) {
    return 'resend_auth_failed';
  }

  if (normalized.includes('from') && normalized.includes('invalid')) {
    return 'invalid_from_address';
  }

  return 'send_failed';
}

export function logPlayerTroveEmailFailure(
  phase: string,
  error: unknown,
  context?: { email?: string }
) {
  const err = error instanceof Error ? error : new Error(String(error));
  const configIssues = getPlayerTroveEmailConfigIssues();
  const recipientDomain = context?.email?.includes('@')
    ? context.email.split('@')[1]?.toLowerCase()
    : undefined;

  console.error('[PlayerTrove Email] Send failed', {
    phase,
    error_name: err.name,
    error_message: err.message,
    error_class: classifyPlayerTroveEmailError(err),
    config_issues: configIssues,
    config_issue_labels: describePlayerTroveEmailConfigIssues(configIssues),
    vercel_env: process.env.VERCEL_ENV ?? null,
    node_env: process.env.NODE_ENV ?? null,
    has_resend_api_key: Boolean(process.env.RESEND_API_KEY?.trim()),
    has_email_from: Boolean(process.env.EMAIL_FROM?.trim()),
    has_token_secret: Boolean(process.env.PLAYERTROVE_TOKEN_SECRET?.trim()),
    email_from: process.env.EMAIL_FROM ?? null,
    base_url: getConfiguredBaseUrl() || 'http://localhost:3000',
    recipient_domain: recipientDomain,
    timestamp: new Date().toISOString(),
  });
}

export function buildPlayerTroveEmailErrorResponse(error: unknown) {
  const configIssues = getPlayerTroveEmailConfigIssues();
  const errorClass = classifyPlayerTroveEmailError(error);
  const err = error instanceof Error ? error : new Error(String(error));

  const response: {
    error: string;
    errorCode: string;
    debug?: string;
  } = {
    error: 'Unable to send email. Please try again later.',
    errorCode: errorClass,
  };

  if (errorClass === 'resend_sandbox_recipient') {
    response.error =
      'We could not deliver email to that address yet. Use the same email you used when purchasing or claiming clips, or contact support.';
  } else if (errorClass === 'resend_domain_unverified') {
    response.error =
      'Email delivery is temporarily unavailable. Please try again later or contact support.';
  }

  if (!isProductionDeploy()) {
    if (configIssues.length > 0) {
      response.debug = describePlayerTroveEmailConfigIssues(configIssues);
    } else {
      response.debug = err.message;
    }
  }

  return response;
}
