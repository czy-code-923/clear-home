<?php
declare(strict_types=1);

// Copy an allowlist of runtime files, without touching real config or navigation.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$target = $argv[1] ?? '';
if ($target === '' || in_array($target, ['-h', '--help'], true)) {
    fwrite(STDOUT, "Usage: php scripts/prepare.php /absolute/path/to/site\nCreates site/public, a config template and the private data directory.\n");
    exit($target === '' ? 1 : 0);
}
try {
    if (!preg_match('~^(?:/|[A-Za-z]:/)~', str_replace('\\', '/', $target))) throw new RuntimeException('Use an absolute target path.');
    if (!is_dir($target) && !mkdir($target, 0750, true)) throw new RuntimeException('Cannot create target directory.');
    $target = realpath($target);
    $source = dirname(__DIR__);
    if ($target === $source) throw new RuntimeException('The target must be different from the source checkout.');
    $public = $target . '/public';
    if (!is_dir($public) && !mkdir($public, 0755)) throw new RuntimeException('Cannot create public directory.');
    foreach (['index.html', 'style.css', 'app.js', 'sync.js', 'api.php'] as $file) {
        if (!copy($source . '/' . $file, $public . '/' . $file)) throw new RuntimeException('Cannot copy ' . $file);
        @chmod($public . '/' . $file, 0644);
    }
    $template = $target . '/clear-home-config.example.php';
    if (!copy($source . '/clear-home-config.example.php', $template)) throw new RuntimeException('Cannot copy configuration template.');
    @chmod($template, 0640);
    if (!is_dir($target . '/clear-home-data') && !mkdir($target . '/clear-home-data', 0700)) throw new RuntimeException('Cannot create data directory.');
    fwrite(STDOUT, "Prepared: $public\nExisting clear-home-config.php and clear-home-data are preserved.\nNext: copy/edit the config template, set PHP user permissions, configure HTTPS and Nginx.\n");
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
