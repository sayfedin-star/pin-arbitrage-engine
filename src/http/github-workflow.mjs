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

  return {
    githubToken: githubToken ? String(githubToken).trim() : null,
    githubRepo: String(githubRepo || defaultRepo).trim()
  };
}

/**
 * Dispatches a GitHub Actions workflow_dispatch event.
 */
export async function dispatchGitHubWorkflow(env, {
  workflowFile,
  ref = 'main',
  inputs = {},
  timeoutMs = 10000,
  userAgent = 'PAE-Fastify-Engine',
  allowPat = false,
  defaultRepo = DEFAULT_GITHUB_REPOSITORY
} = {}) {
  const { githubToken, githubRepo } = resolveGitHubAuth(env, { allowPat, defaultRepo });
  if (!githubToken || !githubRepo) {
    return {
      ok: false,
      status: 400,
      missingToken: true,
      hasToken: Boolean(githubToken),
      githubRepo,
      errorText: 'Missing GITHUB_TOKEN or GITHUB_REPOSITORY in environment'
    };
  }

  const dispatchUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowFile}/dispatches`;
  const ghRes = await fetch(dispatchUrl, {
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

  if (ghRes.ok || ghRes.status === 204) {
    return {
      ok: true,
      status: ghRes.status,
      missingToken: false,
      hasToken: true,
      githubRepo,
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
    errorText
  };
}
