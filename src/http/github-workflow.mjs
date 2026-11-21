/**
 * Shared GitHub Actions Workflow Dispatch Helper (src/http/github-workflow.mjs)
 * Centralizes token/repo resolution and GitHub Actions REST API dispatch calls
 * across keywords, creators, and cluster routes.
 */

export const DEFAULT_GITHUB_REPOSITORY = 'sayfedin-star/pin-arbitrage-engine';

/**
 * Resolves GitHub API token and repository from Worker env or Node process.env.
 */
export function resolveGitHubAuth(env = null, { allowPat = false, defaultRepo = DEFAULT_GITHUB_REPOSITORY } = {}) {
  const procEnv = (typeof process !== 'undefined' && process?.env) ? process.env : {};
  const githubToken = (env && env.GITHUB_TOKEN)
    || (allowPat && env && env.GITHUB_PAT)
    || procEnv.GITHUB_TOKEN
    || (allowPat ? procEnv.GITHUB_PAT : null)
    || null;
  const githubRepo = (env && env.GITHUB_REPOSITORY)
    || procEnv.GITHUB_REPOSITORY
    || defaultRepo;

  const resolvedToken = githubToken ? String(githubToken).trim() : null;
  const resolvedRepo = String(githubRepo || defaultRepo).trim();
  return {
    token: resolvedToken,
    githubToken: resolvedToken,
    repo: resolvedRepo,
    githubRepo: resolvedRepo,
    authHeader: resolvedToken ? `Bearer ${resolvedToken}` : null
  };
}

/**
 * Dispatches a GitHub Actions workflow_dispatch event.
 */
export async function dispatchGitHubWorkflow(envOrOptions, maybeOptions = {}) {
  let env = envOrOptions;
  let options = maybeOptions;
  if (
    envOrOptions &&
    typeof envOrOptions === 'object' &&
    ('workflowFile' in envOrOptions || ('env' in envOrOptions && !('GITHUB_TOKEN' in envOrOptions)))
  ) {
    env = envOrOptions.env ?? null;
    options = envOrOptions;
  }

  const {
    workflowFile,
    ref = 'main',
    inputs = {},
    timeoutMs = 10000,
    userAgent = 'PAE-Fastify-Engine',
    allowPat = false,
    defaultRepo = DEFAULT_GITHUB_REPOSITORY
  } = options || {};

  const { githubToken, githubRepo } = resolveGitHubAuth(env, { allowPat, defaultRepo });
  if (!githubToken || !githubRepo) {
    const msg = 'Missing GITHUB_TOKEN or GITHUB_REPOSITORY in environment';
    return {
      ok: false,
      status: 400,
      missingToken: true,
      hasToken: Boolean(githubToken),
      githubRepo,
      error: msg,
      errorText: msg
    };
  }
  if (!workflowFile) {
    const msg = 'Missing workflowFile for GitHub dispatch';
    return {
      ok: false,
      status: 400,
      missingToken: false,
      hasToken: true,
      githubRepo,
      error: msg,
      errorText: msg
    };
  }

  const cleanRepo = String(githubRepo).trim();
  const cleanWorkflow = String(workflowFile).trim();
  const cleanRef = String(ref || 'main').trim();
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(cleanRepo) || cleanRepo.includes('..')) {
    const msg = 'Invalid GITHUB_REPOSITORY format for GitHub dispatch';
    return {
      ok: false,
      status: 400,
      missingToken: false,
      hasToken: true,
      githubRepo: cleanRepo,
      error: msg,
      errorText: msg
    };
  }
  if (!/^[a-zA-Z0-9._-]+\.ya?ml$/i.test(cleanWorkflow) || cleanWorkflow.includes('..') || cleanWorkflow.includes('/')) {
    const msg = 'Invalid workflowFile name for GitHub dispatch';
    return {
      ok: false,
      status: 400,
      missingToken: false,
      hasToken: true,
      githubRepo: cleanRepo,
      error: msg,
      errorText: msg
    };
  }
  if (!cleanRef || !/^[^\s?#\\]+$/.test(cleanRef) || cleanRef.includes('..')) {
    const msg = 'Invalid git ref for GitHub dispatch';
    return {
      ok: false,
      status: 400,
      missingToken: false,
      hasToken: true,
      githubRepo: cleanRepo,
      error: msg,
      errorText: msg
    };
  }

  const dispatchUrl = `https://api.github.com/repos/${cleanRepo}/actions/workflows/${cleanWorkflow}/dispatches`;
  let ghRes;
  try {
    ghRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref,
        inputs
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const msg = err?.message || 'GitHub workflow dispatch network error';
    return {
      ok: false,
      status: 502,
      missingToken: false,
      hasToken: true,
      githubRepo,
      error: msg,
      errorText: msg
    };
  }

  if (ghRes.ok || ghRes.status === 204) {
    return {
      ok: true,
      status: ghRes.status,
      missingToken: false,
      hasToken: true,
      githubRepo,
      error: '',
      errorText: ''
    };
  }

  const errorText = await ghRes.text().catch(() => '');
  return {
    ok: false,
    status: ghRes.status,
    missingToken: false,
    hasToken: true,
    githubRepo,
    error: errorText || `GitHub API returned HTTP ${ghRes.status}`,
    errorText
  };
}

/**
 * Cancels an active GitHub Actions workflow run via POST /actions/runs/{run_id}/cancel.
 */
export async function cancelGitHubWorkflowRun(
  env,
  { runId, allowPat = true, timeoutMs = 10_000, userAgent = 'PAE-Fastify-Engine', defaultRepo = DEFAULT_GITHUB_REPOSITORY } = {}
) {
  const numericRunId = Number(runId);
  if (!Number.isInteger(numericRunId) || numericRunId <= 0) {
    const msg = 'Invalid GitHub Actions runId for workflow cancellation';
    return {
      ok: false,
      status: 400,
      missingToken: false,
      hasToken: false,
      error: msg
    };
  }

  const { githubToken, githubRepo } = resolveGitHubAuth(env, { allowPat, defaultRepo });
  if (!githubToken || !githubRepo) {
    const msg = 'Missing GITHUB_TOKEN or GITHUB_REPOSITORY in environment';
    return {
      ok: false,
      status: 400,
      missingToken: true,
      hasToken: Boolean(githubToken),
      githubRepo,
      error: msg
    };
  }

  const cleanRepo = String(githubRepo).trim();
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(cleanRepo) || cleanRepo.includes('..')) {
    const msg = 'Invalid GITHUB_REPOSITORY format for workflow cancellation';
    return {
      ok: false,
      status: 400,
      missingToken: false,
      hasToken: true,
      githubRepo: cleanRepo,
      error: msg
    };
  }

  const cancelUrl = `https://api.github.com/repos/${cleanRepo}/actions/runs/${numericRunId}/cancel`;
  let ghRes;
  try {
    ghRes = await fetch(cancelUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': userAgent
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const msg = err?.message || 'GitHub workflow cancel network error';
    return {
      ok: false,
      status: 502,
      missingToken: false,
      hasToken: true,
      githubRepo: cleanRepo,
      error: msg
    };
  }

  // GitHub returns 202 Accepted on cancel, or 409 Conflict if the run already completed
  if (ghRes.ok || ghRes.status === 202 || ghRes.status === 409) {
    return {
      ok: true,
      status: ghRes.status,
      alreadyCompleted: ghRes.status === 409,
      missingToken: false,
      hasToken: true,
      githubRepo: cleanRepo,
      error: ''
    };
  }

  const errorText = await ghRes.text().catch(() => '');
  return {
    ok: false,
    status: ghRes.status,
    missingToken: false,
    hasToken: true,
    githubRepo: cleanRepo,
    error: errorText || `GitHub cancel API returned HTTP ${ghRes.status}`
  };
}

