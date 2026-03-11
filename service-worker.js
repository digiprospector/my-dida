/* ============================================
   My Dida — Service Worker
   缓存静态资源，支持离线访问
   ============================================ */

const CACHE_NAME = 'my-dida-cache-v5';

// 需要预缓存的文件列表
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// ──────────────── Install ────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] 预缓存静态资源');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// ──────────────── Activate ────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME)
                        .map(key => {
                            console.log('[SW] 清除旧缓存:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ──────────────── Fetch ────────────────
self.addEventListener('fetch', event => {
    const { request } = event;

    // 只处理 http/https 请求，跳过 chrome-extension:// 等
    if (!request.url.startsWith('http')) return;

    // 对 Supabase API 请求使用 network-only 策略
    if (request.url.includes('supabase.co')) {
        event.respondWith(fetch(request));
        return;
    }

    // 对静态资源使用 cache-first 策略
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request).then(networkResponse => {
                    // 缓存新的静态资源
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            })
            .catch(() => {
                // 离线降级：如果请求的是 HTML 页面，返回缓存的首页
                if (request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('/index.html');
                }
            })
    );
});

// ──────────────── Push ────────────────
self.addEventListener('push', event => {
    let data = { title: '📝 My Dida 提醒', body: '你有一个待办事项到期了' };

    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (e) {
        if (event.data) {
            data.body = event.data.text();
        }
    }

    // 更新角标的 Promise
    let badgePromise = Promise.resolve();
    if (data.badge_count !== undefined && 'setAppBadge' in navigator) {
        if (data.badge_count > 0) {
            badgePromise = navigator.setAppBadge(data.badge_count);
        } else {
            badgePromise = navigator.clearAppBadge();
        }
    }

    // 静默推送：只更新角标，不弹通知
    if (data.silent) {
        event.waitUntil(badgePromise);
        return;
    }

    const options = {
        body: data.body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: data.tag || 'my-dida-reminder',
        requireInteraction: true,
        data: { url: './' }
    };

    event.waitUntil(
        Promise.all([
            badgePromise,
            self.registration.showNotification(data.title, options)
        ])
    );
});

// ──────────────── Notification Click ────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // 如果已有窗口，聚焦它
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // 否则打开新窗口
                return clients.openWindow('/');
            })
    );
});
