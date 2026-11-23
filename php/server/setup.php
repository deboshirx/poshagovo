<?php
// Первичная настройка после выкладки: кладём демо-базу рядом с сайтом (вне корня),
// если базы ещё нет. В демо-базе пароли захешированы scrypt'ом из Node,
// а в PHP 7.4 его нет — поэтому перехешируем их в bcrypt.

require_once __DIR__ . '/core.php';

function setup_database($reset = false)
{
    $target = db_path();
    $demo = __DIR__ . '/demo.db';
    $log = [];

    if ($reset && file_exists($target)) {
        unlink($target);
        $log[] = 'старая база удалена';
    }

    if (!file_exists($target)) {
        if (!is_dir(dirname($target))) mkdir(dirname($target), 0755, true);
        if (file_exists($demo)) {
            copy($demo, $target);
            $log[] = 'скопирована демо-база';
        } else {
            $log[] = 'демо-базы нет, будет создана пустая';
        }
    } else {
        $log[] = 'база уже есть, не трогаем';
    }

    $hash = password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT);
    $n = q("UPDATE users SET password_hash = ? WHERE password_hash NOT LIKE '$2y$%'", [$hash])->rowCount();
    if ($n) $log[] = "перехешировано паролей: $n";

    $log[] = 'sqlite ' . db()->query('SELECT sqlite_version()')->fetchColumn();
    $log[] = 'инструкций в базе: ' . db()->query('SELECT COUNT(*) FROM guides')->fetchColumn();
    return $log;
}
