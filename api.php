<?php
declare(strict_types=1);

// All mutable data and credentials live OUTSIDE the public document root.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
function reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function fail(int $status, string $message, string $code = 'error'): never { reply($status, ['error' => $message, 'code' => $code]); }
function textValue(mixed $s, int $max, bool $empty = false): bool {
    return is_string($s) && preg_match('//u', $s) === 1 && strlen($s) <= $max * 4 && ($empty || trim($s) !== '');
}
function validateState(mixed $d): array {
    if (!is_array($d) || ($d['version'] ?? null) !== 1 || !is_array($d['categories'] ?? null) || !array_is_list($d['categories']) || count($d['categories']) < 1 || count($d['categories']) > 50 || !is_array($d['sites'] ?? null) || !array_is_list($d['sites']) || count($d['sites']) > 2000) fail(422, '导航数据格式错误');
    $groups = [];
    foreach ($d['categories'] as $g) {
        if (!is_array($g) || !textValue($g['id'] ?? null, 100) || $g['id'] === 'all' || !textValue($g['name'] ?? null, 30) || isset($groups[$g['id']])) fail(422, '分类数据无效');
        $groups[$g['id']] = true;
    }
    $ids = [];
    foreach ($d['sites'] as $s) {
        if (!is_array($s) || !textValue($s['id'] ?? null, 100) || isset($ids[$s['id']]) || !textValue($s['name'] ?? null, 60) || !textValue($s['url'] ?? null, 2048) || !textValue($s['icon'] ?? null, 16, true) || !textValue($s['description'] ?? null, 150, true) || !is_string($s['category'] ?? null) || !isset($groups[$s['category']]) || !in_array($s['target'] ?? null, ['_blank', '_self'], true) || !is_bool($s['favorite'] ?? null)) fail(422, '网站数据无效');
        $url = parse_url($s['url']);
        if (!$url || !in_array(strtolower($url['scheme'] ?? ''), ['http', 'https'], true) || empty($url['host']) || isset($url['user']) || isset($url['pass']) || preg_match('/[\x00-\x20]/', $s['url'])) fail(422, '网站地址只允许 HTTP / HTTPS');
        $ids[$s['id']] = true;
    }
    $s = $d['settings'] ?? null;
    if (!is_array($s) || !in_array($s['theme'] ?? null, ['light', 'dark', 'auto'], true) || !is_string($s['accent'] ?? null) || !preg_match('/^#[0-9a-f]{6}$/iD', $s['accent']) || !in_array($s['background'] ?? null, ['sky', 'mint', 'lavender', 'custom'], true) || !in_array($s['engine'] ?? null, ['bing', 'baidu', 'google', 'bilibili'], true) || !is_string($s['backgroundImage'] ?? null) || strlen($s['backgroundImage']) > 2900000 || ($s['backgroundImage'] !== '' && !preg_match('~^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$~D', $s['backgroundImage']))) fail(422, '外观设置无效');
    return ['version' => 1, 'categories' => $d['categories'], 'sites' => $d['sites'], 'settings' => $s];
}
function readStore(string $file): array {
    if (!is_file($file)) return ['revision' => 0, 'data' => null];
    $json = file_get_contents($file);
    if ($json === false) throw new RuntimeException('Cannot read store');
    $record = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($record) || !is_int($record['revision'] ?? null) || !is_array($record['data'] ?? null)) throw new RuntimeException('Store is corrupt');
    return $record;
}
try {
    // Portable layout: site/public + site/clear-home-config.php.
    // Keep the original BaoTa /www configuration location compatible.
    $configPath = getenv('CLEAR_HOME_CONFIG');
    if (!$configPath) {
        $adjacentConfig = dirname(__DIR__) . '/clear-home-config.php';
        $legacyConfig = dirname(__DIR__, 2) . '/clear-home-config.php';
        $configPath = @is_file($adjacentConfig) ? $adjacentConfig : $legacyConfig;
    }
    if (!is_file($configPath)) fail(503, '尚未配置服务器保存。请按部署说明创建站点目录之外的 clear-home-config.php。', 'setup_required');
    $realConfig = realpath($configPath);
    foreach ([realpath(__DIR__), realpath($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)] as $root) {
        if ($root && ($realConfig === $root || str_starts_with($realConfig . DIRECTORY_SEPARATOR, $root . DIRECTORY_SEPARATOR))) fail(503, '管理员配置文件必须位于网站公开根目录之外。', 'setup_required');
    }
    $config = require $configPath;
    if (!is_array($config) || !is_string($config['admin_password'] ?? null) || strlen($config['admin_password']) < 12 || $config['admin_password'] === 'CHANGE_THIS_PASSWORD' || !is_string($config['data_dir'] ?? null)) fail(503, '配置未完成：请设置至少 12 位的管理员密码和数据目录。', 'setup_required');
    $dir = $config['data_dir'];
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) throw new RuntimeException('Cannot create data directory');
    $realDir = realpath($dir);
    $publicRoot = realpath(__DIR__);
    $documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? __DIR__) ?: $publicRoot;
    foreach ([$publicRoot, $documentRoot] as $root) {
        if ($realDir === $root || str_starts_with($realDir . DIRECTORY_SEPARATOR, $root . DIRECTORY_SEPARATOR)) fail(503, '数据目录必须位于网站公开根目录之外。', 'setup_required');
    }
    if (!is_writable($dir)) fail(503, 'PHP 无法写入数据目录，请在宝塔中设置目录所有者和权限。', 'storage_unavailable');
    if (!is_dir($dir . '/sessions') && !mkdir($dir . '/sessions', 0700)) throw new RuntimeException('Cannot create sessions directory');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '43200');
    session_save_path($dir . '/sessions');
    session_name('CLEARHOMESESSID');
    // Set secure_cookie=true only when the public site is always served over HTTPS,
    // including HTTPS terminated by a trusted reverse proxy. Never trust arbitrary headers.
    $secureCookie = ($config['secure_cookie'] ?? false) === true || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $secureCookie, 'httponly' => true, 'samesite' => 'Strict']);
    if (!session_start()) throw new RuntimeException('Cannot start session');
    // Changing the configured password invalidates existing logged-in sessions.
    $fingerprint = hash('sha256', $config['admin_password']);
    $authenticated = isset($_SESSION['authenticated_at'], $_SESSION['password_fingerprint']) && hash_equals($fingerprint, $_SESSION['password_fingerprint']) && time() - $_SESSION['authenticated_at'] < 43200;
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $method = $_SERVER['REQUEST_METHOD'];
    $op = $_GET['op'] ?? 'state';
    if ($method === 'GET' && $op === 'state') reply(200, array_merge(readStore($dir . '/navigation.json'), ['authenticated' => $authenticated, 'csrf' => $_SESSION['csrf']]));
    if (!in_array($method, ['POST', 'PUT'], true)) fail(405, '不支持的请求');
    if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail(403, '页面会话已失效，请刷新后再试', 'csrf');
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') fail(415, '请求格式必须是 JSON');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 5 * 1024 * 1024) fail(413, '请求内容不能超过 5 MB');
    $body = file_get_contents('php://input', false, null, 0, 5 * 1024 * 1024 + 1);
    if ($body === false || strlen($body) > 5 * 1024 * 1024) fail(413, '请求内容过大');
    try { $input = json_decode($body, true, 64, JSON_THROW_ON_ERROR); } catch (JsonException $e) { fail(400, 'JSON 格式错误'); }
    if (!is_array($input)) fail(400, 'JSON 格式错误');
    if ($method === 'POST' && $op === 'login') {
        // Per-IP, persisted rate limit: a fresh cookie cannot bypass it.
        $ratePath = $dir . '/login-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
        $rateFile = fopen($ratePath, 'c+');
        if (!$rateFile || !flock($rateFile, LOCK_EX)) throw new RuntimeException('Cannot lock login counter');
        $rate = json_decode(stream_get_contents($rateFile) ?: '{}', true) ?: [];
        if (time() - ($rate['start'] ?? 0) > 900) $rate = ['start' => time(), 'count' => 0];
        if (($rate['count'] ?? 0) >= 10) { fclose($rateFile); fail(429, '尝试次数过多，请 15 分钟后再试'); }
        $password = $input['password'] ?? '';
        $correct = is_string($password) && strlen($password) <= 1024 && hash_equals($fingerprint, hash('sha256', $password));
        $rate['count'] = $correct ? 0 : ($rate['count'] ?? 0) + 1;
        rewind($rateFile); ftruncate($rateFile, 0); fwrite($rateFile, json_encode($rate)); fflush($rateFile); fclose($rateFile); @chmod($ratePath, 0600);
        if (!$correct) fail(401, '管理员密码不正确', 'invalid_password');
        session_regenerate_id(true);
        $_SESSION['authenticated_at'] = time(); $_SESSION['password_fingerprint'] = $fingerprint;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        reply(200, ['authenticated' => true, 'csrf' => $_SESSION['csrf']]);
    }
    if ($method === 'POST' && $op === 'logout') { $_SESSION = []; session_destroy(); reply(200, ['ok' => true]); }
    if (!$authenticated) fail(401, '请先登录管理员，再保存到 VPS', 'login_required');
    if ($method !== 'PUT' || $op !== 'state') fail(405, '不支持的请求');
    if (!is_int($input['revision'] ?? null)) fail(422, '缺少有效的数据版本');
    $data = validateState($input['data'] ?? null);
    $lock = fopen($dir . '/navigation.lock', 'c+');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock store');
    $record = readStore($dir . '/navigation.json');
    if ($input['revision'] !== $record['revision']) { fclose($lock); fail(409, '另一台设备已更新导航。已保留你的未保存内容，请刷新最新数据后重新修改。', 'conflict'); }
    $record = ['revision' => $record['revision'] + 1, 'data' => $data];
    $encoded = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temp = tempnam($dir, '.navigation-');
    if ($temp === false) throw new RuntimeException('Cannot create temporary file');
    try {
        if (file_put_contents($temp, $encoded) !== strlen($encoded)) throw new RuntimeException('Cannot write data');
        @chmod($temp, 0600);
        if (!rename($temp, $dir . '/navigation.json')) throw new RuntimeException('Cannot replace store');
    } finally { if (is_file($temp)) unlink($temp); }
    fclose($lock);
    reply(200, ['revision' => $record['revision'], 'saved' => true]);
} catch (Throwable $e) {
    error_log('Clear Home API: ' . $e->getMessage());
    fail(500, '服务器读写失败，数据未确认保存。请检查 PHP 错误日志和数据目录权限。', 'storage_error');
}
