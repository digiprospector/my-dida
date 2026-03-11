-- ============================================
-- My Dida — Supabase 数据库设置
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================

-- 1. 创建 todos 表（如果还没创建的话）
CREATE TABLE IF NOT EXISTS todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  remind_at TIMESTAMPTZ DEFAULT NULL,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 如果 todos 表已存在但缺少字段，补充添加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'notified'
  ) THEN
    ALTER TABLE todos ADD COLUMN notified BOOLEAN DEFAULT FALSE;
  END IF;

  -- 循环规则：{ type: 'daily'|'weekly'|'monthly'|'yearly', ... }
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'recurrence'
  ) THEN
    ALTER TABLE todos ADD COLUMN recurrence JSONB DEFAULT NULL;
  END IF;

  -- 本次任务发生的日期（循环任务每次生成一条记录对应一个日期）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE todos ADD COLUMN scheduled_date DATE DEFAULT NULL;
  END IF;

  -- 多点提醒：[{ offset_days: 0|-1|-2, time: "HH:MM" }, ...]
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'reminders'
  ) THEN
    ALTER TABLE todos ADD COLUMN reminders JSONB DEFAULT NULL;
  END IF;

  -- 是否为倒数日任务
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'is_countdown'
  ) THEN
    ALTER TABLE todos ADD COLUMN is_countdown BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 3. 开启 RLS 并允许所有操作
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON todos;
CREATE POLICY "Allow all" ON todos FOR ALL USING (true) WITH CHECK (true);

-- 4. 推送订阅表
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON push_subscriptions;
CREATE POLICY "Allow all" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- 5. 启用扩展（用于定时任务和 HTTP 调用）
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 6. 定时任务：每分钟调用 send-reminders Edge Function
-- 注意：需要先设置 service_role_key
-- 方法：在 Supabase Dashboard → SQL Editor 执行以下命令
-- 将 <YOUR_SERVICE_ROLE_KEY> 替换为你的 service_role key
-- （在 Settings → API → service_role key 中找到）

-- SELECT cron.schedule(
--   'send-reminders',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://luuexfhzcglvphfzdtuk.supabase.co/functions/v1/send-reminders',
--     headers := '{"Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
