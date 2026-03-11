# 📝 My Dida — 待办事项 PWA

一个简洁美观、功能丰富的待办事项渐进式 Web 应用（PWA），支持循环任务、多点提醒、倒数日、推送通知等功能。可安装到手机桌面，像原生 App 一样使用。

---

## ✨ 功能介绍

### 📋 任务管理
- **创建 / 编辑 / 删除** 待办事项
- **一键完成** 任务，自动置于底部并标记 Done
- **多视图切换**：今天、全部、倒数日、配置 四个底部 Tab 页

### 🔁 循环任务（Recurrence）
- 支持 **四种循环类型**：
  - **每天** — 设定每 N 天重复（如每 1 天 = 每天，每 3 天 = 每三天一次）
  - **每周** — 选择周内具体星期几（支持多选，如周一、三、五）
  - **每月** — 指定每月几号（支持多个日期，如 1 号和 15 号；负数表示倒数，-1 = 每月最后一天）
  - **每年** — 指定月/日
- 可设定 **结束日期**（无结束日期 = 永久循环）
- 完成一次后 **自动创建下一次任务实例**
- 📅 **打卡记录**：编辑循环任务时，弹窗内展示该任务的历史完成记录列表

### ⏰ 多点提醒（Reminders）
- 每个任务可添加 **多个提醒时间点**
- 每个提醒可设置：
  - **偏移天数**：前 2 天、前 1 天、当天、后 1 天
  - **具体时间**：精确到 HH:MM
- 支持 **浏览器本地通知** + **Web Push 推送通知**（即使页面关闭也能收到）

### ⭐ 倒数日（Countdown）
- 任意任务可标记为 **倒数日**
- 倒数日页面专门展示这些任务，显示距离目标日期的天数

### 📊 智能显示
- **今天页面**：只显示今天需要做的任务（含循环任务自动匹配），不显示日期徽标
- **全部页面**：展示所有任务，隐藏完成复选框（只读模式）；循环任务自动显示"今天"或"下一次"的日期
- **倒数日页面**：专注展示倒数日任务，循环任务显示最近的下一次日期
- 每个任务卡片上的 **彩色徽标** 直观展示：循环规则、倒数日标记、日期、提醒数量、完成状态

### 📱 PWA 特性
- **支持安装到桌面**，像原生 App 一样使用
- **离线可用** — Service Worker 缓存静态资源
- **iOS / Android 适配** — 安全区域处理、状态栏颜色、App 图标
- **应用角标** — 在支持的设备上显示未完成任务数

---

## 🛠 技术栈

| 分类 | 技术 |
|------|------|
| **前端** | 原生 HTML / CSS / JavaScript（无框架） |
| **字体** | [Google Fonts — Inter](https://fonts.google.com/specimen/Inter) |
| **UI 风格** | 暗色主题、glassmorphism、微动画 |
| **后端 / 数据库** | [Supabase](https://supabase.com)（PostgreSQL + RESTful API） |
| **推送通知** | Web Push API + [web-push](https://www.npmjs.com/package/web-push) npm 包 |
| **定时任务** | Supabase `pg_cron` + `pg_net` 扩展 |
| **边缘函数** | Supabase Edge Functions（Deno 运行时） |
| **PWA** | Service Worker + Web App Manifest |
| **部署** | GitHub Pages / 任意静态托管 |
| **许可证** | MIT |

---

## 📁 项目结构

```
my-dida/
├── index.html                 # 主页面（单页应用）
├── style.css                  # 全局样式（暗色主题 + 响应式布局）
├── app.js                     # 核心业务逻辑（任务 CRUD、循环、提醒、渲染）
├── service-worker.js          # PWA Service Worker（缓存 + 推送通知）
├── manifest.json              # PWA 清单文件
├── icons/
│   ├── icon-192.png           # App 图标 192x192
│   └── icon-512.png           # App 图标 512x512
├── supabase/
│   ├── setup.sql              # 数据库建表 SQL（含 RLS、pg_cron 配置）
│   └── functions/
│       └── send-reminders/
│           └── index.ts       # Edge Function：到期提醒推送 + 角标更新
├── LICENSE                    # MIT 许可证
└── README.md                  # 本文件
```

---

## 🚀 快速开始

### 前置条件

- 一个 [Supabase](https://supabase.com) 账号（免费版即可）
- 一个静态网站托管服务（如 GitHub Pages、Vercel、Netlify，或者本地 `npx serve`）

### 第一步：创建 Supabase 项目

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 点击 **New Project**，填写项目名称和数据库密码
3. 选择离你最近的 Region
4. 等待项目创建完成

### 第二步：初始化数据库

1. 在 Supabase Dashboard 中打开 **SQL Editor**
2. 复制 `supabase/setup.sql` 中的全部内容并执行
3. 这会自动创建：
   - `todos` 表（含 `text`、`completed`、`recurrence`、`scheduled_date`、`reminders`、`is_countdown` 等字段）
   - `push_subscriptions` 表（推送订阅管理）
   - Row Level Security 策略
   - 必要的 PostgreSQL 扩展（`pg_cron`、`pg_net`）

### 第三步：配置前端

为了安全起见（特别是在公开仓库中），我们使用 GitHub Secrets 注入配置。

1.  在 Supabase Dashboard → **Settings → API** 中找到：
    -   **Project URL**（如 `https://xxxxx.supabase.co`）
    -   **Anon / Public Key**（`anon` 公钥）

2.  打开 `app.js`，确保头部的两个常量使用了占位符：

```javascript
const SUPABASE_URL = '___SUPABASE_URL___';
const SUPABASE_ANON_KEY = '___SUPABASE_ANON_KEY___';
```

### 第四步：部署与安全配置 (GitHub Secrets)

本项目配置了 GitHub Actions 自动部署脚本（`.github/workflows/deploy.yml`），可以在部署时自动注入密钥。

1.  将代码推送到 GitHub 仓库。
2.  在 GitHub 仓库页面，进入 **Settings** -> **Secrets and variables** -> **Actions**。
3.  点击 **New repository secret**，添加以下两个变量：
    -   `SUPABASE_URL`: 填入你的 Supabase Project URL。
    -   `SUPABASE_ANON_KEY`: 填入你的 Supabase Anon Key。
4.  进入 **Settings** -> **Pages**，在 **Build and deployment** > **Source** 下选择 **GitHub Actions**。
5.  之后每次 `git push` 时，GitHub Actions 会自动：
    -   检出代码。
    -   将 `app.js` 中的占位符替换为真实的 Secret。
    -   自动部署到 GitHub Pages。

---

#### 本地开发与测试

如果你想在本地运行，可以直接在 `app.js` 中临时填写真实的 URL 和 Key（**注意不要 Commit 到公开仓库**），然后启动本地服务器：

```bash
# 方式 1：使用 npx serve（推荐，零安装）
npx -y serve .
# 默认在 http://localhost:3000 启动

# 方式 2：使用 Python 内置服务器
python -m http.server 8000
# 在 http://localhost:8000 访问

# 方式 3：使用 VS Code Live Server 扩展
# 安装 "Live Server" 扩展后，右键 index.html → Open with Live Server
```

> **⚠️ 注意事项**
> - 请勿直接双击 `index.html` 打开（`file://` 协议下 Service Worker 和部分 API 无法正常工作）
> - 推送通知功能需要 HTTPS 环境，本地测试时浏览器通知仅支持 `localhost`
> - 修改代码后如果页面未更新，可能是 Service Worker 缓存导致，请在浏览器 DevTools → Application → Service Workers 中点击 **Unregister** 后刷新

### 第五步：配置推送通知（可选）

如需支持后台推送提醒，需要额外配置：

#### 1. 生成 VAPID 密钥对

```bash
npx web-push generate-vapid-keys
```

会输出类似：
```
Public Key:  BJ4hyMVsCzUu...
Private Key: dGhpcyBpcyBhI...
```

#### 2. 更新前端 VAPID 公钥

在 `app.js` 中修改：

```javascript
const VAPID_PUBLIC_KEY = '你生成的 Public Key';
```

#### 3. 部署 Edge Function

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref 你的project-ref

# 设置环境变量
supabase secrets set VAPID_PUBLIC_KEY="你的公钥"
supabase secrets set VAPID_PRIVATE_KEY="你的私钥"
supabase secrets set VAPID_SUBJECT="mailto:你的邮箱"

# 部署函数
supabase functions deploy send-reminders --no-verify-jwt
```

#### 4. 配置定时任务（pg_cron）

在 Supabase SQL Editor 中执行（取消 `setup.sql` 末尾的注释并填入 service_role key）：

```sql
SELECT cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://你的项目.supabase.co/functions/v1/send-reminders',
    headers := '{"Authorization": "Bearer 你的SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

---

## 📱 安装到手机

### iOS (Safari)
1. 用 Safari 打开网站
2. 点击底部 **分享按钮** (⬆️)
3. 选择 **添加到主屏幕**

### Android (Chrome)
1. 用 Chrome 打开网站
2. 点击浏览器菜单 **⋮**
3. 选择 **安装应用** 或 **添加到主屏幕**

---

## 🗄 数据库表结构

### `todos` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键，自动生成 |
| `text` | TEXT | 任务内容 |
| `completed` | BOOLEAN | 是否已完成 |
| `scheduled_date` | DATE | 任务日期 |
| `recurrence` | JSONB | 循环规则，如 `{"type":"daily","interval":1}` |
| `reminders` | JSONB | 提醒列表，如 `[{"offset_days":0,"time":"09:00"}]` |
| `is_countdown` | BOOLEAN | 是否标记为倒数日 |
| `remind_at` | TIMESTAMPTZ | 旧版单点提醒时间（向后兼容） |
| `notified` | BOOLEAN | 是否已发送推送通知 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

### `push_subscriptions` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `endpoint` | TEXT | 推送端点 URL（唯一） |
| `p256dh` | TEXT | 加密公钥 |
| `auth` | TEXT | 认证密钥 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

---

## 📄 许可证

[MIT License](LICENSE) © 2026 digiprospector
