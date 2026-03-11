// ============================================
// My Dida — Edge Function: send-reminders
// 每分钟由 pg_cron 调用，检查到期提醒并发送 Web Push
// ============================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ──────────── 环境变量 ────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@my-dida.app';

// 配置 web-push
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// CORS 头（允许 GitHub Pages 等跨域调用）
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (_req) => {
  // 处理 CORS 预检请求
  if (_req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const url = new URL(_req.url);
    const badgeOnly = url.searchParams.get('badge_only') === 'true';
    const clearAll = url.searchParams.get('clear_all') === 'true';

    // ── 清除所有订阅模式 ──
    if (clearAll) {
      console.log('[DEBUG] 收到清除所有订阅请求');
      const { error } = await supabase.from('push_subscriptions').delete().neq('endpoint', ''); // neq '' matches all strings
      if (error) {
        console.error('清除订阅失败:', error);
        return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse({ message: '已清除所有推送订阅' });
    }

    // 获取所有推送订阅
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ message: '没有推送订阅' });
    }

    // 计算未完成任务数（角标）
    const { count: pendingCount } = await supabase
      .from('todos')
      .select('*', { count: 'exact', head: true })
      .eq('completed', false);

    console.log('[DEBUG] 收到消息');
    // ── badge_only 模式：只更新角标，不弹通知 ──
    if (badgeOnly) {
      console.log('[BADGE] badge_only 模式启动');
      console.log('[BADGE] 未完成任务数:', pendingCount);
      console.log('[BADGE] 订阅数量:', subscriptions.length);

      const payload = JSON.stringify({
        title: '',
        body: '',
        badge_count: pendingCount || 0,
        //silent: true,
      });

      let okCount = 0;
      let errCount = 0;

      for (const sub of subscriptions) {
        try {
          console.log('[BADGE] 发送推送到:', sub.endpoint.substring(0, 60) + '...');
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          okCount++;
          console.log('[BADGE] 推送成功');
        } catch (err) {
          errCount++;
          console.error('[BADGE] 推送失败:', String(err));
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            console.log('[BADGE] 已删除失效订阅');
          }
        }
      }

      console.log(`[BADGE] 完成: 成功${okCount}, 失败${errCount}`);
      return jsonResponse({ message: '角标已更新', badge: pendingCount, ok: okCount, err: errCount });
    }

    // ── 正常模式：检查到期提醒并发推送 ──
    const now = new Date().toISOString();
    const { data: dueTodos, error: todosError } = await supabase
      .from('todos')
      .select('*')
      .eq('completed', false)
      .eq('notified', false)
      .lte('remind_at', now)
      .not('remind_at', 'is', null);

    if (todosError) {
      console.error('查询到期提醒失败:', todosError);
      return jsonResponse({ error: todosError.message }, 500);
    }

    if (!dueTodos || dueTodos.length === 0) {
      return jsonResponse({ message: '没有到期提醒', count: 0 });
    }

    console.log(`找到 ${dueTodos.length} 个到期提醒`);

    const results = [];

    for (const todo of dueTodos) {
      const payload = JSON.stringify({
        title: '📝 My Dida 提醒',
        body: todo.text,
        tag: `reminder-${todo.id}`,
        badge_count: pendingCount || 0,
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          results.push({ todo: todo.id, status: 'ok' });
          console.log(`推送成功: ${todo.text}`);
        } catch (err) {
          console.error(`推送失败 (todo: ${todo.id}):`, err.message);
          results.push({ todo: todo.id, status: 'error', error: err.message });

          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            console.log('已删除失效订阅');
          }
        }
      }

      await supabase.from('todos').update({ notified: true }).eq('id', todo.id);
    }

    return jsonResponse({ message: `已处理 ${dueTodos.length} 个提醒`, results });

  } catch (err) {
    console.error('Edge Function 错误:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
