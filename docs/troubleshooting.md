# 排障手册

先打开 `https://你的域名/api.php?op=state`，区分网络、PHP 执行和配置错误。GET 读取不需要管理员密码。

| 现象 | 原因与处理 |
| --- | --- |
| 换浏览器后只有默认示例 | 确认运行 v2 服务器版、已登录且保存后显示 VPS 成功。直接双击本地 HTML 仅本机保存。源码仓库不包含你的个人书签。 |
| “保存接口未运行” / HTTP 200 空白 HTML | 核对 PHP 8.2、api.php 路径、Nginx 精确匹配规则、FastCGI socket；使用 deploy/fastcgi-params.conf 完整参数，必须有 SCRIPT_FILENAME、REQUEST_METHOD、QUERY_STRING、CONTENT_TYPE、CONTENT_LENGTH 等。不要仅配置 HTTP_HOST。 |
| PHP 文件被下载或暴露源码 | PHP 没有正确接管请求，停止对外提供该文件并修复 Nginx/PHP handler，不能按静态文件运行。 |
| 404 | root 应直接包含 index.html 和 api.php；检查是否多套了一层目录。 |
| 502 | PHP-FPM 没启动、socket 路径错或 Nginx 无权连接；核对实际 PHP 版本、socket 和日志。 |
| `setup_required` | 密码须至少 12 位，不能是模板占位；配置文件需在公开根目录外，PHP 可读。 |
| 配置文件已存在仍报未配置 | 检查 open_basedir 是否允许配置完整路径；`.user.ini` 可能有缓存，需要重载对应 PHP-FPM。 |
| `storage_unavailable` / `storage_error` | 数据目录属于正确 PHP 用户，允许写入和创建 sessions；父目录可遍历，磁盘可用，锁和原子重命名正常。查看 PHP error_log。 |
| 401 / 403 | 会话过期或 CSRF 失效，刷新并重新登录；浏览器需允许本站 Cookie；sessions 目录需可写。 |
| 409 | 其他设备已保存新版本，旧页面被拒绝覆盖。先导出未保存内容，再刷新服务器数据后重新编辑。 |
| 429 | 同源地址登录尝试过多，等待 15 分钟。经过 CDN 时原始 REMOTE_ADDR 可能是共享出口，所以不要连续猜密码。 |
| 413 / 背景上传失败 | 图片限制 2 MB，请求限制 5 MB；Nginx client_max_body_size 至少 5m；不要压缩或截断 JSON 请求体。 |
| 浏览器依然显示旧版 | 强制刷新；检查 CDN 是否缓存 HTML/JS 或错误页；API 必须绕过缓存且保留 no-store。 |
| HTTP 正常但 HTTPS 不正常 | 核对 HTTPS server 是否使用同一 root 和 API 规则，证书是否有效；检查 CDN 是否回源到另一台服务器。 |

## 权限检查

使用实际 PHP 运行用户（宝塔通常 www，Debian/Ubuntu 通常 www-data）：

```sh
sudo -u www-data test -r /srv/clear-home/site/clear-home-config.php && echo CONFIG_READ_OK
sudo -u www-data test -w /srv/clear-home/site/clear-home-data && echo DATA_WRITE_OK
```

不要公开输出配置文件内容、Cookie 或密码。语法检查可以执行 `php -l /路径/public/api.php`，它不会输出密码。

## HTTPS 反向代理与 Cookie

直接由 Nginx 终止 HTTPS 时，参数片段传入 HTTPS，Cookie 自动标记 Secure。若可信代理/CDN 在上游终止 HTTPS，把私有配置中的 `secure_cookie` 设为 true，公开入口必须始终 HTTPS；应用不会盲信客户端传来的 X-Forwarded-Proto。更推荐代理到源站也使用有效 HTTPS。

项目的静态预览、本机 PHP 测试和真实 VPS 是不同层次的验证；API 测试通过后仍需在目标 VPS 核对 FPM、Nginx、证书和权限。
