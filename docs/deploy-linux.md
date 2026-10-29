# Debian / Ubuntu 手动部署

示例使用 PHP 8.2；不同系统的软件仓库可能提供 8.3 或 8.4，修改 socket 和服务名即可。不指定发行版专属仓库，也不执行第三方一键安装脚本。

## 1. 安装运行环境并下载源码

```sh
sudo apt update
sudo apt install nginx php-fpm php-cli git
sudo git clone https://github.com/czy-code-923/clear-home.git /srv/clear-home/source
php -v
ls /run/php/
```

确认 PHP >= 8.2，记下真实 PHP-FPM socket，例如 `/run/php/php8.2-fpm.sock`。生产运行无需 npm，npm 仅用于开发检查。

## 2. 准备公开目录和私有配置

```sh
sudo php /srv/clear-home/source/scripts/prepare.php /srv/clear-home/site
sudo cp -n /srv/clear-home/site/clear-home-config.example.php /srv/clear-home/site/clear-home-config.php
sudoedit /srv/clear-home/site/clear-home-config.php
```

将密码改为至少 12 位（推荐 16 位以上），保留 `data_dir` 默认相对路径。启用 HTTPS 后把 `secure_cookie` 改为 `true`。

权限示例（Debian/Ubuntu 的 PHP 用户通常是 www-data）：

```sh
sudo chown root:www-data /srv/clear-home/site /srv/clear-home/site/clear-home-config.php
sudo chmod 750 /srv/clear-home/site
sudo chmod 640 /srv/clear-home/site/clear-home-config.php
sudo chown -R www-data:www-data /srv/clear-home/site/clear-home-data
sudo chmod 700 /srv/clear-home/site/clear-home-data
```

其他父目录也必须允许 PHP/Nginx 用户遍历。不要将权限改成 777。

## 3. Nginx 与 PHP-FPM

```sh
sudo install -m 644 /srv/clear-home/source/deploy/fastcgi-params.conf /etc/nginx/snippets/clear-home-fastcgi.conf
sudo cp /srv/clear-home/source/deploy/nginx.conf.example /etc/nginx/sites-available/clear-home
sudoedit /etc/nginx/sites-available/clear-home
```

把 server_name 改为你的域名，核对 root 和 PHP socket。配置只允许精确的 `/api.php` 交给 PHP，其他 PHP 路径拒绝访问。模板提供完整参数，不依赖可能残缺的系统 fastcgi.conf。

启用站点（若同名链接已存在，请先检查目标，不要重复创建）：

```sh
sudo ln -s /etc/nginx/sites-available/clear-home /etc/nginx/sites-enabled/clear-home
sudo nginx -t
# 校验成功后
sudo systemctl reload nginx
```

如配置了 PHP open_basedir，允许 public、真实配置文件、私有 data_dir 和 /tmp，参照 [`deploy/user.ini.example`](../deploy/user.ini.example)。Nginx server 或 FPM pool 若设置了更严格的 php_admin_value，也需要在对应站点范围内调整。

## 4. 配置 HTTPS

将域名解析到 VPS，开放 80/443。使用你已有的证书管理方式，或系统提供的 Certbot Nginx 集成，为该域名申请证书并启用 HTTPS。证书工具通常会自动增加 443 监听与续期任务。按其指引完成验证，然后执行 `nginx -t`。

若手动配置，保留模板的 API、静态资源与拒绝访问规则，在 HTTPS server 中添加：

```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/nav.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/nav.example.com/privkey.pem;
```

证书路径和域名须按实际替换；80 端口的跳转规则要兼容证书续期验证。不能使用没有有效证书的路径。

## 5. 验证并首次保存

```sh
curl -i 'https://nav.example.com/api.php?op=state'
```

应返回 `Content-Type: application/json`、`Cache-Control: no-store, private` 和 `revision` 等字段。不要把返回的会话 Cookie 或 CSRF 字段粘贴到公开 Issue。

浏览器打开 HTTPS 首页 → 管理员登录 → 添加网站 → 等待「已保存到 VPS」→ 在其他浏览器访问同一个域名。其他已打开页面约 20 秒自动读取新版本，编辑弹窗打开时暂缓刷新。

## 6. 更新

先备份私有配置和数据，再拉取源码并重新准备公开文件：

```sh
sudo git -C /srv/clear-home/source pull --ff-only
sudo php /srv/clear-home/source/scripts/prepare.php /srv/clear-home/site
```

准备工具只复制运行文件和无密码模板，不改真实配置、导航 JSON、sessions 或 Nginx/TLS 配置。刷新页面并核对接口，不需要重建数据库。

## 自定义位置和多个实例

默认先找公开根目录上一层的 `clear-home-config.php`，再兼容旧版两层上级位置；也可在本站 Nginx 的 API location 中设置：

```nginx
fastcgi_param CLEAR_HOME_CONFIG /etc/clear-home/instance-a.php;
```

配置仍必须在网站公开目录之外，且应加入该实例 open_basedir。多个导航实例请分别使用配置文件、data_dir 和独立域名，避免共用会话 Cookie。

技术参考：[Nginx FastCGI 官方文档](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html)。
