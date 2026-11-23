<?php
// База, ответы, ошибки и мелкие хелперы — аналог server/src/db.js + utils.js

define('DEMO_PASSWORD', 'demo1234');

function db_path()
{
    return getenv('POSHAGOVO_DB') ?: dirname(__DIR__, 2) . '/data/app.db';
}

class HttpError extends Exception
{
    public $status;

    public function __construct($status, $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

function not_found($message = 'Не найдено')
{
    return new HttpError(404, $message);
}

function db()
{
    static $pdo = null;
    if ($pdo) return $pdo;

    $path = db_path();
    $fresh = !file_exists($path);
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0755, true);

    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    if ($fresh) $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    return $pdo;
}

// PDO по умолчанию биндит всё строками, а sqlite сравнивает '3' и 3 по-разному
// (например в MAX()), поэтому типы проставляем явно
function q($sql, array $params = [])
{
    $st = db()->prepare($sql);
    $i = 1;
    foreach ($params as $value) {
        if (is_int($value)) $type = PDO::PARAM_INT;
        elseif (is_bool($value)) { $value = (int) $value; $type = PDO::PARAM_INT; }
        elseif ($value === null) $type = PDO::PARAM_NULL;
        else $type = PDO::PARAM_STR;
        $st->bindValue($i++, $value, $type);
    }
    $st->execute();
    return $st;
}

function one($sql, array $params = [])
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function all($sql, array $params = [])
{
    return q($sql, $params)->fetchAll();
}

function last_id()
{
    return (int) db()->lastInsertId();
}

function tx(callable $fn)
{
    db()->beginTransaction();
    try {
        $result = $fn();
        db()->commit();
        return $result;
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
}

// pdo_sqlite в PHP 7.4 отдаёт числа строками. Фронт сравнивает id через ===,
// так что перед отдачей приводим числовые поля к числам. Текстовые поля не трогаем.
const TEXT_KEYS = [
    'title', 'body', 'description', 'tags', 'name', 'email', 'anon_id', 'cover', 'tip',
    'checklist', 'author_name', 'parent_title', 'verified_by_name', 'step_title', 'category',
    'difficulty', 'status', 'kind', 'role', 'type', 'created_at', 'updated_at', 'started_at',
    'finished_at', 'day', 'token', 'error', 'source', 'reasons',
];

function cast_numbers($value, $key = null)
{
    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) $out[$k] = cast_numbers($v, is_string($k) ? $k : $key);
        return $out;
    }
    if (is_string($value) && $key !== null && !in_array($key, TEXT_KEYS, true) && is_numeric($value)) {
        return preg_match('/^-?\d+$/', $value) ? (int) $value : (float) $value;
    }
    return $value;
}

function json_out($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(cast_numbers($data), JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function no_content()
{
    http_response_code(204);
    exit;
}

function body()
{
    static $body = null;
    if ($body === null) {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!is_array($body)) $body = [];
    }
    return $body;
}

function input($key, $default = null)
{
    $b = body();
    return array_key_exists($key, $b) ? $b[$key] : $default;
}

function str($value, $max = 200)
{
    return is_string($value) ? mb_substr(trim($value), 0, $max) : '';
}

// как parseInt в JS: '12abc' -> 12, мусор -> $fallback
function to_int($value, $fallback = 0)
{
    if (is_int($value)) return $value;
    if (is_float($value)) return (int) $value;
    if (is_string($value) && preg_match('/^\s*(-?\d+)/', $value, $m)) return (int) $m[1];
    return $fallback;
}

function clamp($n, $min, $max)
{
    return min($max, max($min, $n));
}

function sql_date($timestamp)
{
    return gmdate('Y-m-d H:i:s', $timestamp);
}

function parse_sql_date($s)
{
    return strtotime($s . ' UTC');
}

const CATEGORIES = [
    ['id' => 'study', 'name' => 'Учёба'],
    ['id' => 'docs', 'name' => 'Документы и справки'],
    ['id' => 'tech', 'name' => 'Железо и техника'],
    ['id' => 'dev', 'name' => 'Разработка и софт'],
    ['id' => 'life', 'name' => 'Быт'],
    ['id' => 'other', 'name' => 'Другое'],
];
