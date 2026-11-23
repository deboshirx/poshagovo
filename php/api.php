<?php
// Точка входа PHP-версии API. Повторяет маршруты Express-сервера один в один,
// чтобы фронтенд работал без изменений. Нужна для обычного виртуального хостинга без Node.js.

require __DIR__ . '/server/core.php';
require __DIR__ . '/server/auth.php';
require __DIR__ . '/server/search.php';
require __DIR__ . '/server/analytics.php';
require __DIR__ . '/server/assist.php';
require __DIR__ . '/server/guides.php';
require __DIR__ . '/server/runs.php';

mb_internal_encoding('UTF-8');

$routes = [
    ['POST', '#^/auth/register$#', 'route_register'],
    ['POST', '#^/auth/login$#', 'route_login'],
    ['GET', '#^/auth/me$#', 'route_me'],
    ['POST', '#^/auth/logout$#', 'route_logout'],

    ['GET', '#^/guides/categories$#', 'route_categories'],
    ['GET', '#^/guides$#', 'route_guides_list'],
    ['POST', '#^/guides$#', 'route_guide_create'],
    ['GET', '#^/guides/(\d+)$#', 'route_guide_get'],
    ['PUT', '#^/guides/(\d+)$#', 'route_guide_update'],
    ['DELETE', '#^/guides/(\d+)$#', 'route_guide_delete'],
    ['POST', '#^/guides/(\d+)/fork$#', 'route_guide_fork'],
    ['POST', '#^/guides/(\d+)/rate$#', 'route_guide_rate'],
    ['POST', '#^/guides/(\d+)/verify$#', 'route_guide_verify'],
    ['GET', '#^/guides/(\d+)/stats$#', 'route_guide_stats'],
    ['GET', '#^/guides/(\d+)/comments$#', 'route_comments_list'],

    ['POST', '#^/runs$#', 'route_run_start'],
    ['GET', '#^/runs/mine$#', 'route_runs_mine'],
    ['PATCH', '#^/runs/(\d+)$#', 'route_run_update'],
    ['POST', '#^/runs/(\d+)/events$#', 'route_run_events'],
    ['POST', '#^/runs/(\d+)/finish$#', 'route_run_finish'],

    ['POST', '#^/steps/(\d+)/comments$#', 'route_comment_create'],
    ['POST', '#^/steps/(\d+)/vote$#', 'route_step_vote'],
    ['PATCH', '#^/comments/(\d+)$#', 'route_comment_update'],
    ['DELETE', '#^/comments/(\d+)$#', 'route_comment_delete'],

    ['GET', '#^/assist/status$#', 'route_assist_status'],
    ['POST', '#^/assist/split$#', 'route_assist_split'],
];

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api#', '', rtrim($path, '/')) ?: '/';
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && ($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? '') === 'PATCH') $method = 'PATCH';

try {
    foreach ($routes as [$routeMethod, $pattern, $handler]) {
        if ($routeMethod === $method && preg_match($pattern, $path, $m)) {
            $args = array_map('intval', array_slice($m, 1));
            $handler(...$args);
            exit;
        }
    }
    throw new HttpError(404, 'Нет такого метода API');
} catch (HttpError $e) {
    json_out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('poshagovo: ' . $e);
    // подробности ошибки — только тому, кто знает ключ установки
    $keyFile = __DIR__ . '/install.key';
    $debug = file_exists($keyFile) && hash_equals(trim(file_get_contents($keyFile)), $_SERVER['HTTP_X_DEBUG_KEY'] ?? '');
    json_out(['error' => $debug ? (string) $e : 'Ошибка на сервере, попробуйте ещё раз'], 500);
}
