// Optional local launcher. Production uses Nginx + PHP in BaoTa.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT)||4173;
const child=spawn(process.env.PHP_BINARY||'php',['-S',`127.0.0.1:${port}`,'-t',root],{stdio:'inherit',env:process.env});
child.on('error',()=>{console.error('本地跨设备版需要 PHP 8.2+。请安装 PHP 并加入 PATH，或按 README 部署到宝塔。');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
