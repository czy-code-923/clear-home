'use strict';
// Same-origin PHP API. No administrator password is stored by the browser.
class NavigationServer {
  constructor(endpoint = 'api.php') {
    this.endpoint = endpoint;
    this.revision = null;
    this.csrf = '';
    this.authenticated = false;
    this.ready = false;
  }
  async request(op, method = 'GET', body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${this.endpoint}?op=${op}`, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: {Accept:'application/json', ...(body ? {'Content-Type':'application/json','X-CSRF-Token':this.csrf} : {})},
        ...(body ? {body:JSON.stringify(body)} : {})
      });
      const type = response.headers.get('content-type') || '';
      if (!type.includes('application/json')) throw Error('保存接口未运行。请将宝塔站点切换为 PHP 8.2，并上传 api.php。');
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || `服务器请求失败（${response.status}）`);
        error.status = response.status;
        error.code = result.code;
        if (response.status === 401) this.authenticated = false;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('服务器连接超时，保存结果未确认。请恢复网络后刷新核对，未保存内容可导出。');
      if (error instanceof TypeError) throw Error('无法连接 VPS。请检查网络；当前修改尚未确认保存。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async load() {
    const result = await this.request('state');
    if (!Number.isSafeInteger(result.revision) || result.revision < 0 || typeof result.authenticated !== 'boolean' || typeof result.csrf !== 'string') throw Error('保存接口返回了无效数据');
    return result;
  }
  accept(result) {
    this.revision = result.revision;
    this.csrf = result.csrf;
    this.authenticated = result.authenticated;
    this.ready = true;
  }
  async save(data) {
    const result = await this.request('state', 'PUT', {revision:this.revision, data});
    if (result.saved !== true || !Number.isSafeInteger(result.revision)) throw Error('服务器没有确认保存，请刷新核对');
    this.revision = result.revision;
  }
  async login(password) {
    const result = await this.request('login', 'POST', {password});
    this.csrf = result.csrf;
    this.authenticated = result.authenticated;
  }
  async logout() {
    await this.request('logout', 'POST', {});
    this.authenticated = false;
    this.ready = false;
  }
}
