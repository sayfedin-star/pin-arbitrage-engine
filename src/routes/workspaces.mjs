/**
 * src/routes/workspaces.mjs
 *
 * V4 Workspaces & Central Workspace Settings Sub-Router (`/api/workspaces` and `/api/workspaces/*`).
 */

import {
  DEFAULT_WORKSPACE_ID,
  parsePositiveWorkspaceId,
  buildWorkspaceCookieHeader,
  listWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceSettings,
  updateWorkspaceSettings,
  getWorkspaceCookieStatus,
  saveWorkspaceCookie,
  clearWorkspaceCookie,
  resolveActivePinterestCookie
} from '../modules/workspaces/service.mjs';

export function isWorkspacesRoute(pathname) {
  return pathname === '/api/workspaces' || pathname.startsWith('/api/workspaces/');
}

export async function handleWorkspacesRoutes({
  pathname,
  method,
  request,
  reply,
  sql,
  workspaceId = DEFAULT_WORKSPACE_ID,
  jsonResponse,
  methodNotAllowedResponse,
  invalidateEdgeCache
}) {
  // 1. GET /api/workspaces — List all workspaces + active workspace_id
  if (pathname === '/api/workspaces') {
    if (method === 'GET') {
      const workspaces = await listWorkspaces(sql);
      const activeId = workspaces.some((w) => w.id === workspaceId)
        ? workspaceId
        : (workspaces[0]?.id || DEFAULT_WORKSPACE_ID);
      return jsonResponse({
        success: true,
        active_workspace_id: activeId,
        workspaces
      });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const created = await createWorkspace(sql, {
        name: body.name,
        icon: body.icon
      });
      if (typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache('workspaces');
      }
      return jsonResponse({ success: true, workspace: created }, 201);
    }

    return methodNotAllowedResponse('GET, POST, OPTIONS');
  }

  // 2. POST /api/workspaces/switch — Persist active workspace in HttpOnly SameSite=Lax cookie
  if (pathname === '/api/workspaces/switch') {
    if (method !== 'POST') {
      return methodNotAllowedResponse('POST, OPTIONS');
    }
    const body = await request.json().catch(() => ({}));
    const targetId = parsePositiveWorkspaceId(body.workspace_id ?? body.id);
    if (!targetId) {
      return jsonResponse({ success: false, error: 'BAD_REQUEST', message: 'Valid numeric workspace_id is required.' }, 400);
    }
    const ws = await getWorkspaceById(sql, targetId);
    if (!ws) {
      return jsonResponse({ success: false, error: 'NOT_FOUND', message: `Workspace ${targetId} not found.` }, 404);
    }

    const isHttps = Boolean(
      request?.protocol === 'https' ||
      String(request?.headers?.['x-forwarded-proto'] || '').toLowerCase() === 'https'
    );
    const cookieHeader = buildWorkspaceCookieHeader(ws.id, { secure: isHttps });
    if (reply && typeof reply.header === 'function') {
      reply.header('Set-Cookie', cookieHeader);
    }
    return jsonResponse({
      success: true,
      active_workspace_id: ws.id,
      workspace: ws
    });
  }

  // 3. GET / PUT / PATCH /api/workspaces/settings — Unified central workspace settings
  if (pathname === '/api/workspaces/settings') {
    if (method === 'GET') {
      const settings = await getWorkspaceSettings(sql, workspaceId);
      return jsonResponse({ success: true, workspace_id: workspaceId, settings });
    }
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const settings = await updateWorkspaceSettings(sql, workspaceId, body);
      if (typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache(`ws:${workspaceId}:`);
      }
      return jsonResponse({ success: true, workspace_id: workspaceId, settings });
    }
    return methodNotAllowedResponse('GET, PUT, PATCH, POST, OPTIONS');
  }

  // 3B. GET / POST / DELETE /api/workspaces/cookie — Write-only Zone-A Pinterest Session Cookie (Single Source of Truth)
  // [INVARIANT: ZERO-SECRET-LEAK] Never returns raw cookie strings in any response.
  // [INVARIANT: WORKSPACE-COOKIE-ISOLATION] Strictly backed by workspace_settings.pinterest_cookie_enc; WS 2+ never inherits WS 1 or env.
  if (pathname === '/api/workspaces/cookie') {
    const isDefaultWorkspace = Number(workspaceId) === DEFAULT_WORKSPACE_ID;
    if (reply && typeof reply.header === 'function') {
      reply.header('Cache-Control', 'private, no-store, max-age=0');
    }
    if (method === 'GET') {
      const wsStatus = await getWorkspaceCookieStatus(sql, workspaceId);
      let hasCookie = Boolean(wsStatus?.has_cookie);
      if (!hasCookie && isDefaultWorkspace) {
        const resolved = await resolveActivePinterestCookie(sql, { workspaceId }).catch(() => ({ hasCookie: false }));
        hasCookie = Boolean(resolved?.hasCookie);
      }
      return jsonResponse({
        success: true,
        workspace_id: workspaceId,
        has_cookie: hasCookie,
        is_configured: hasCookie,
        preview: hasCookie ? '[CONFIGURED]' : '',
        zone_routing_mode: hasCookie ? 'two_zone_auth_plus_zero_cookie' : 'guest_zero_cookie_fallback'
      }, 200, -1);
    }
    if (method === 'POST' || method === 'PUT') {
      try {
        const body = await request.json().catch(() => ({}));
        const rawCookie = String(body?.cookie ?? body?.raw_cookie ?? body?.pinterest_cookie ?? '').trim();
        const wsStatus = await saveWorkspaceCookie(sql, workspaceId, rawCookie);
        if (typeof invalidateEdgeCache === 'function') {
          await Promise.all([
            `ws:${workspaceId}:`,
            'settings',
            'workspaces',
            'keywords',
            'creators',
            ...(isDefaultWorkspace ? ['newborn'] : [])
          ].map((scope) => Promise.resolve(invalidateEdgeCache(scope)).catch(() => {})));
        }
        return jsonResponse({
          success: true,
          workspace_id: workspaceId,
          has_cookie: Boolean(wsStatus.has_cookie),
          is_configured: Boolean(wsStatus.is_configured),
          preview: '[CONFIGURED]',
          zone_routing_mode: 'two_zone_auth_plus_zero_cookie'
        }, 200, -1);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, err.status || 400, -1);
      }
    }
    if (method === 'DELETE') {
      await clearWorkspaceCookie(sql, workspaceId);
      if (typeof invalidateEdgeCache === 'function') {
        await Promise.all([
          `ws:${workspaceId}:`,
          'settings',
          'workspaces',
          'keywords',
          'creators',
          ...(isDefaultWorkspace ? ['newborn'] : [])
        ].map((scope) => Promise.resolve(invalidateEdgeCache(scope)).catch(() => {})));
      }
      return jsonResponse({
        success: true,
        workspace_id: workspaceId,
        has_cookie: false,
        is_configured: false,
        preview: '',
        zone_routing_mode: 'guest_zero_cookie_fallback'
      }, 200, -1);
    }
    return methodNotAllowedResponse('GET, POST, PUT, DELETE, OPTIONS');
  }

  // 4. GET / PATCH / PUT / DELETE /api/workspaces/:id
  const idMatch = pathname.match(/^\/api\/workspaces\/(\d+)$/);
  if (idMatch) {
    const targetId = Number(idMatch[1]);
    if (method === 'GET') {
      const ws = await getWorkspaceById(sql, targetId);
      if (!ws) return jsonResponse({ success: false, error: 'NOT_FOUND', message: `Workspace ${targetId} not found.` }, 404);
      return jsonResponse({ success: true, workspace: ws });
    }
    if (method === 'PATCH' || method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const updated = await updateWorkspace(sql, targetId, {
        name: body.name,
        icon: body.icon
      });
      if (!updated) return jsonResponse({ success: false, error: 'NOT_FOUND', message: `Workspace ${targetId} not found.` }, 404);
      if (typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache('workspaces');
      }
      return jsonResponse({ success: true, workspace: updated });
    }
    if (method === 'DELETE') {
      const deleted = await deleteWorkspace(sql, targetId);
      if (!deleted) return jsonResponse({ success: false, error: 'NOT_FOUND', message: `Workspace ${targetId} not found.` }, 404);
      if (targetId === workspaceId && reply && typeof reply.header === 'function') {
        const isHttps = Boolean(
          request?.protocol === 'https' ||
          String(request?.headers?.['x-forwarded-proto'] || '').toLowerCase() === 'https'
        );
        reply.header('Set-Cookie', buildWorkspaceCookieHeader(DEFAULT_WORKSPACE_ID, { secure: isHttps }));
      }
      if (typeof invalidateEdgeCache === 'function') {
        await invalidateEdgeCache('workspaces');
        await invalidateEdgeCache(`ws:${targetId}:`);
      }
      return jsonResponse({ success: true, deleted, active_workspace_id: targetId === workspaceId ? DEFAULT_WORKSPACE_ID : workspaceId });
    }
    return methodNotAllowedResponse('GET, PATCH, PUT, DELETE, OPTIONS');
  }

  return null;
}
