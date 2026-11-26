import { test, expect } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:8791';

test('Falsita Auth: 站内登录、验证码校验、429/503 处理、活动续期合并与退出登录', async ({ page }) => {
  let authed = false;
  let statusCode = 401;
  let loginMode = 'normal';
  let activityMode = 'normal';
  let logoutMode = 'normal';
  let loginCalls = 0;
  let activityCalls = 0;
  const authBodies = [];

  await page.route(`${apiOrigin}/api/auth/**`, async route => {
    const request = route.request();
    const action = new URL(request.url()).pathname.slice('/api/auth/'.length);

    if (action === 'status') {
      if (statusCode === 503) return route.fulfill({ status: 503, json: { error: 'auth_unavailable' } });
      if (!authed) return route.fulfill({ status: 401, json: { error: 'session_invalid' } });
      return route.fulfill({ status: 200, json: { authenticated: true } });
    }

    if (action === 'login') {
      ++loginCalls;
      const body = request.postDataJSON();
      authBodies.push({ action, body });
      if (loginMode === 'rate-limit') {
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '2', 'Access-Control-Expose-Headers': 'Retry-After' },
          json: { error: 'auth_rate_limited' },
        });
      }
      if (loginMode === 'unavailable') {
        return route.fulfill({ status: 503, json: { error: 'auth_unavailable' } });
      }
      if (body?.code === '012345' || body?.code === '0123456789abcdef0123456789abcdef') {
        authed = true;
        statusCode = 200;
        return route.fulfill({ status: 200, json: { authenticated: true } });
      }
      return route.fulfill({ status: 401, json: { error: 'invalid_code' } });
    }

    if (action === 'activity') {
      ++activityCalls;
      authBodies.push({ action, body: request.postData() });
      if (activityMode === 'expired') {
        authed = false;
        statusCode = 401;
        return route.fulfill({ status: 401, json: { error: 'session_invalid' } });
      }
      if (activityMode === 'rate-limit') {
        authed = false;
        statusCode = 401;
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '2', 'Access-Control-Expose-Headers': 'Retry-After' },
          json: { error: 'auth_rate_limited' },
        });
      }
      return route.fulfill({ status: 200, json: { authenticated: true } });
    }

    if (action === 'logout') {
      authBodies.push({ action, body: request.postData() });
      authed = false;
      statusCode = 401;
      if (logoutMode === 'unconfirmed') {
        return route.fulfill({ status: 503, json: { error: 'revocation_unconfirmed' } });
      }
      return route.fulfill({ status: 200, json: { remoteRevoked: true } });
    }

    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });

  // Intercept /api/manage/* in this auth-flow test so we stay isolated from fixture cookies.
  let manageCalls = 0;
  await page.route(`${apiOrigin}/api/manage/**`, async route => {
    ++manageCalls;
    const path = new URL(route.request().url()).pathname.slice('/api/manage'.length);
    if (!authed) return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    if (path === '/products' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: { products: [] } });
    }
    if (path === '/holdings') return route.fulfill({ status: 200, json: { holdings: [] } });
    if (path === '/room') {
      return route.fulfill({
        status: 200,
        json: {
          shareToken: null,
          surfaces: [],
          placements: [],
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });

  // 1. 503 on initial status: shows temporary error and keeps management hidden.
  statusCode = 503;
  await page.goto('/');
  const status = page.locator('#manage-status');
  const loginForm = page.locator('#auth-login');
  const logoutBtn = page.getByRole('button', { name: '退出登录' });
  await expect(status).toHaveText('暂时无法验证身份，请稍后重试。');
  await expect(page.locator('#management')).toBeHidden();
  await expect(loginForm).toBeHidden();
  expect(manageCalls).toBe(0);
  expect(activityCalls).toBe(0);

  // 2. Retry status -> 401: shows login form without touching /api/manage/* or /activity.
  statusCode = 401;
  await page.getByRole('button', { name: '重新加载管理数据' }).click();
  await expect(status).toHaveText('尚未验证身份，无法访问订购管理。');
  await expect(loginForm).toBeVisible();
  await expect(logoutBtn).toBeHidden();
  expect(manageCalls).toBe(0);
  expect(activityCalls).toBe(0);

  // 3. Invalid client-side format does not hit /api/auth/login.
  await loginForm.getByLabel('验证码或恢复码').fill('abc');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(status).toContainText('6 位数字验证码或 32 位小写十六进制恢复码');
  expect(loginCalls).toBe(0);

  // 4. 401 invalid_code: advises checking code / waiting for next code, no auto-retry.
  await loginForm.getByLabel('验证码或恢复码').fill('999999');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(status).toContainText('验证码或恢复码无效');
  expect(loginCalls).toBe(1);

  // 5. 503 auth_unavailable on login: no auto-retry.
  loginMode = 'unavailable';
  await loginForm.getByLabel('验证码或恢复码').fill('012345');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(status).toContainText('暂时不可用');
  expect(loginCalls).toBe(2);

  // 6. 429 Retry-After disables submit until cooldown expires, no auto-retry.
  loginMode = 'rate-limit';
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(status).toContainText('2 秒后重试');
  await expect(loginForm.getByRole('button', { name: '登录' })).toBeDisabled();
  expect(loginCalls).toBe(3);
  await expect(loginForm.getByRole('button', { name: '登录' })).toBeEnabled({ timeout: 5000 });
  expect(loginCalls).toBe(3);

  // 7. Successful login with 32-char recovery code loads management without calling activity.
  loginMode = 'normal';
  await loginForm.getByLabel('验证码或恢复码').fill('0123456789abcdef0123456789abcdef');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(status).toHaveText('已登录，管理数据已加载。');
  await expect(page.locator('#management')).toBeVisible();
  await expect(loginForm).toBeHidden();
  await expect(logoutBtn).toBeVisible();
  expect(activityCalls).toBe(0);

  // 8. Reload with active session: GET /status returns 200, loads management, does NOT call /activity.
  await page.reload();
  await expect(page.locator('#management')).toBeVisible();
  await expect(logoutBtn).toBeVisible();
  expect(activityCalls).toBe(0);

  // 9. Rapid real user interactions coalesce into a single POST /api/auth/activity with no body.
  const activityDone = page.waitForResponse(`${apiOrigin}/api/auth/activity`);
  await page.locator('#create-product [name="name"]').click();
  await page.locator('#create-product [name="name"]').fill('测试商品');
  await page.locator('#create-product [name="category"]').selectOption('game');
  await activityDone;
  expect(activityCalls).toBe(1);
  expect(authBodies.find(entry => entry.action === 'activity')?.body ?? null).toBeNull();

  // 10. Logout clears private UI and shows login form.
  await logoutBtn.click();
  await expect(status).toHaveText('已退出登录。');
  await expect(page.locator('#management')).toBeHidden();
  await expect(loginForm).toBeVisible();
  await expect(logoutBtn).toBeHidden();
  expect(authBodies.at(-1)).toEqual({ action: 'logout', body: null });

  // 11. Login again, reload, and verify 503 revocation_unconfirmed still clears local session.
  await loginForm.getByLabel('验证码或恢复码').fill('012345');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(page.locator('#management')).toBeVisible();
  logoutMode = 'unconfirmed';
  await logoutBtn.click();
  await expect(status).toContainText('远端撤销未得到确认');
  await expect(page.locator('#management')).toBeHidden();
  await expect(loginForm).toBeVisible();

  // 12. Login again, reload, and verify 401 on /activity clears UI and requires re-login without retry.
  logoutMode = 'normal';
  await loginForm.getByLabel('验证码或恢复码').fill('012345');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(page.locator('#management')).toBeVisible();
  await page.reload();
  await expect(page.locator('#management')).toBeVisible();
  activityMode = 'expired';
  const beforeExpiredCalls = activityCalls;
  await page.locator('#create-product [name="name"]').click();
  await expect(status).toHaveText('会话已失效，请重新登录。');
  await expect(page.locator('#management')).toBeHidden();
  await expect(loginForm).toBeVisible();
  expect(activityCalls).toBe(beforeExpiredCalls + 1);

  // 13. Login again, reload, and verify 429 on /activity clears UI and respects Retry-After.
  activityMode = 'normal';
  await loginForm.getByLabel('验证码或恢复码').fill('012345');
  await loginForm.getByRole('button', { name: '登录' }).click();
  await expect(page.locator('#management')).toBeVisible();
  await page.reload();
  await expect(page.locator('#management')).toBeVisible();
  activityMode = 'rate-limit';
  const beforeRateLimitCalls = activityCalls;
  await page.locator('#create-product [name="name"]').click();
  await expect(status).toContainText('2 秒后重新登录');
  await expect(page.locator('#management')).toBeHidden();
  await expect(loginForm).toBeVisible();
  await expect(loginForm.getByRole('button', { name: '登录' })).toBeDisabled();
  expect(activityCalls).toBe(beforeRateLimitCalls + 1);
});
