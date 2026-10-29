# 备份、恢复与换 VPS

源码仓库保存程序和无密码模板，不保存你的书签、真实配置、密码或登录会话。仅重新 clone 仓库会得到默认示例，已有导航需另外迁移。

## 方法 A：页面 JSON 迁移（推荐）

1. 在旧站点设置中「导出 JSON」。检查网站、分类和背景完整。
2. 在新 VPS 按 [宝塔](deploy-baota.md) 或 [Linux](deploy-linux.md) 文档部署相同版本源码，设置新密码和 HTTPS。
3. 登录新站点管理员，选择「导入备份」，核对确认框数量后恢复。
4. 等待「已保存到 VPS」。在第二个浏览器访问新域名，检查新增、排序、收藏和外观。
5. 如要沿用原域名，确认新站点和证书正常后再切换 DNS。DNS 生效前不要在新旧两端同时编辑。

JSON 导入会替换新服务器当前导航；先导出新服务器数据可回退。不要把个人 JSON 上传到公开仓库或 Issue。

## 方法 B：服务器文件迁移

数据默认在配置文件同级的 `clear-home-data/navigation.json`，旧宝塔布局可能是 `/www/clear-home-data/navigation.json`。复制前从配置中确认真实路径。

迁移时暂缓管理端编辑，确保没有正在写入。只传输 `navigation.json`，不要搬运 `sessions/`、`login-*.json` 或锁文件。导航 JSON 内含 revision 包装，**服务器文件与页面导出的 JSON 格式不同**，不要把页面备份直接覆盖成 navigation.json；页面备份应走页面导入。

把 navigation.json 放入新配置指定的 data_dir，设为 PHP 运行用户所有、文件权限 600，数据目录 700。刷新页面读取并重新登录。迁移完成前保留原服务器备份。

## 定期备份

优先备份：真实配置文件、navigation.json、Nginx 站点配置和证书恢复所需资料。密码和证书私钥必须放在受限存储中。

在 Linux 示例布局中，可用以下命令创建私有备份（先确认实际路径，并在没有编辑保存时执行）：

```sh
sudo sh -c 'umask 077; tar --exclude="clear-home-data/sessions" --exclude="clear-home-data/login-*" --exclude="clear-home-data/navigation.lock" -czf "/root/clear-home-backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C /srv/clear-home/site clear-home-config.php clear-home-data'
```

不要把备份放在 public 中。恢复前先查看压缩包内容，避免覆盖错误目录。自动化备份可接入已有 VPS 备份系统；本项目不会自行上传备份或自动创建计划任务。

## 回退源码

每次升级前记录 `git rev-parse HEAD`。若新版异常，保留当前数据备份，用 Git 检出上一个确认可用的提交，再运行 prepare 工具。数据格式版本升级时请优先使用对应版本的导出与恢复说明，避免旧代码误读新格式。
