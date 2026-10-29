# 宝塔部署与旧版升级

运行环境：Nginx、PHP 8.2+。不需要数据库或 Node.js 守护进程。示例域名 `nav.example.com` 均需替换成自己的域名。

## 新 VPS：从仓库准备站点

1. 在宝塔软件商店安装 Nginx 和 PHP 8.2；把域名解析到 VPS。
2. 在终端下载代码并生成专用公开目录（代码与数据分开）：

```sh
git clone https://github.com/czy-code-923/clear-home.git /opt/clear-home-source
/www/server/php/82/bin/php /opt/clear-home-source/scripts/prepare.php /www/wwwroot/clear-home
```

3. 宝塔添加 PHP 网站：域名填自己的域名，根目录设为 **`/www/wwwroot/clear-home/public`**，PHP 选择 **8.2**，FTP 和数据库均可不创建。首页保持 `index.html`。
4. 复制配置模板到公开目录之外，编辑密码：

```sh
cp -n /www/wwwroot/clear-home/clear-home-config.example.php /www/wwwroot/clear-home/clear-home-config.php
```

编辑 `/www/wwwroot/clear-home/clear-home-config.php`，把 `CHANGE_THIS_PASSWORD` 改为至少 12 位的独立密码，推荐 16 位以上。默认 `data_dir` 会指向同级 `clear-home-data`。开通 HTTPS 后，将 `secure_cookie` 设为 `true`。

5. 给 PHP 用户 `www` 必要的权限（若运行用户不同，按实际替换）：

```sh
chown root:www /www/wwwroot/clear-home /www/wwwroot/clear-home/clear-home-config.php
chmod 750 /www/wwwroot/clear-home
chmod 640 /www/wwwroot/clear-home/clear-home-config.php
chown -R www:www /www/wwwroot/clear-home/clear-home-data
chmod 700 /www/wwwroot/clear-home/clear-home-data
```

6. 宝塔若启用防跨站（open_basedir），在 `public/.user.ini` 中保留站点限制，只允许这些专用路径：

```ini
open_basedir=/www/wwwroot/clear-home/public/:/www/wwwroot/clear-home/clear-home-config.php:/www/wwwroot/clear-home/clear-home-data/:/tmp/
```

若 `.user.ini` 被面板锁定，使用宝塔提供的配置入口编辑；需要终端编辑时，先备份并记录属性，仅临时解除文件不可变属性，编辑后恢复。不要关闭整台服务器的防跨站限制。

7. 为避免系统 FastCGI 文件损坏或缺参数，安装项目提供的完整参数片段：

```sh
cp /opt/clear-home-source/deploy/fastcgi-params.conf /www/server/nginx/conf/clear-home-fastcgi.conf
```

在宝塔 → 网站 → 设置 → 配置文件，把 [`deploy/baota-api.conf.example`](../deploy/baota-api.conf.example) 中的 `location = /api.php { ... }` 放到该站点现有 `server { ... }` 内。**不要替换整个配置文件**，保留已有的域名、证书和其他宝塔配置。同一 `server` 内只能有一份 `/api.php` 精确匹配配置；若之前已加过，更新原来的那份。

8. 先校验，再重载：

```sh
/www/server/nginx/sbin/nginx -t
# 上一步成功后再执行
/www/server/nginx/sbin/nginx -s reload
/etc/init.d/php-fpm-82 reload
```

9. 宝塔 → 网站 → SSL，为自己的域名申请有效证书并启用 HTTPS。按面板要求开放 80/443、完成域名验证。若使用 CDN，推荐 CDN 到源站也使用有效 HTTPS；不要关闭证书验证来排障。
10. 打开 `https://nav.example.com/api.php?op=state`，确认响应是 JSON，首次应有 `revision:0`、`data:null`。然后访问首页、登录管理员、保存一个网站，用另一个浏览器打开核对。首次示例只在页面显示，管理员第一次保存后才落到服务器。

配置结构：

```text
/www/wwwroot/clear-home/
├── public/                         ← 网站根目录
│   ├── index.html / style.css
│   ├── app.js / sync.js / api.php
│   └── .user.ini                    ← 若宝塔要求
├── clear-home-config.php            ← 私有配置
├── clear-home-config.example.php    ← 无密码模板
└── clear-home-data/                 ← PHP 可写、禁止公开访问
```

## 已部署旧版：保持原目录和数据

旧版可能把 `index.html` 直接放在 `/www/wwwroot/clear-home`，真实配置放在 `/www/clear-home-config.php`，数据放在 `/www/clear-home-data`。新版继续支持这一布局，无需挪动真实数据。

1. 先在浏览器导出 JSON，并备份 `/www/clear-home-config.php` 和 `/www/clear-home-data` 到不公开位置。
2. 从代码的部署产物中取 **5 个运行文件**，覆盖原站点同名文件；不要覆盖真实配置、数据或 `.user.ini`。可以先在另一目录运行 `scripts/prepare.php`，再从它的 `public/` 复制这 5 个文件。
3. 站点根目录、配置和数据位置保持原样。防跨站路径使用：

```ini
open_basedir=/www/wwwroot/clear-home/:/www/clear-home-config.php:/www/clear-home-data/:/tmp/
```

4. 仍然需要 PHP 8.2、正确 FastCGI 参数和 HTTPS。上述独立 `/api.php` 配置对旧布局同样适用，`$document_root` 会使用当前站点根目录。
5. Ctrl+F5 强制刷新；如果旧版网站只存在原浏览器缓存中，在管理员设置中选择「发布旧版本机导航」或导入原 JSON。迁移会替换服务器导航，先检查确认框中的数量。

## 最常见的三类部署错误

| 提示/响应 | 检查 |
| --- | --- |
| HTTP 200 但空白 HTML | PHP FastCGI 参数是否缺失；使用项目独立参数文件，尤其 `SCRIPT_FILENAME` |
| `setup_required` | 私有配置的路径、字段名、密码至少 12 位、读权限、open_basedir |
| `storage_error` / 写入失败 | PHP 用户能否写 data_dir，能否创建 sessions 和锁文件；磁盘容量是否足够 |

更多问题见 [排障](troubleshooting.md)，跨 VPS 搬迁见 [备份与迁移](backup-migration.md)。
