<?php
// Порт server/src/routes/runs.js и comments.js

function format_run(array $run)
{
    $checked = json_decode($run['checked']);
    // пустой {} должен остаться объектом, а не превратиться в []
    $run['checked'] = is_object($checked) ? $checked : new stdClass();
    return $run;
}

function get_own_run($id)
{
    $run = one('SELECT * FROM runs WHERE id = ?', [$id]);
    if (!$run) throw not_found('Прохождение не найдено');
    $uid = user_id();
    $anon = anon_id();
    $mine = ($uid && (int) $run['user_id'] === $uid) || ($anon && $run['anon_id'] === $anon);
    if (!$mine) throw new HttpError(403, 'Это чужое прохождение');
    return $run;
}

function steps_count($guideId)
{
    return (int) one('SELECT COUNT(*) AS n FROM steps WHERE guide_id = ?', [$guideId])['n'];
}

function route_run_start()
{
    $uid = user_id();
    $anon = anon_id();
    if (!$uid && !$anon) throw new HttpError(400, 'Нет идентификатора пользователя');

    $guideId = to_int(input('guideId'));
    $guide = one('SELECT id, status, author_id FROM guides WHERE id = ?', [$guideId]);
    if (!$guide || ($guide['status'] !== 'published' && (int) $guide['author_id'] !== $uid)) {
        throw not_found('Инструкция не найдена');
    }

    if (!input('restart')) {
        $active = one('
            SELECT * FROM runs
            WHERE guide_id = ? AND finished_at IS NULL AND (user_id = ? OR (user_id IS NULL AND anon_id = ?))
            ORDER BY id DESC LIMIT 1
        ', [$guideId, $uid ?? -1, $anon ?? '']);
        if ($active) json_out(format_run($active));
    }

    q('INSERT INTO runs (guide_id, user_id, anon_id) VALUES (?, ?, ?)', [$guideId, $uid, $anon]);
    json_out(format_run(one('SELECT * FROM runs WHERE id = ?', [last_id()])), 201);
}

function route_runs_mine()
{
    $user = require_auth();
    $runs = all('
        SELECT r.*, g.title, g.cover, (SELECT COUNT(*) FROM steps s WHERE s.guide_id = g.id) AS steps_count
        FROM runs r JOIN guides g ON g.id = r.guide_id
        WHERE r.id IN (SELECT MAX(id) FROM runs WHERE user_id = ? GROUP BY guide_id)
        ORDER BY r.updated_at DESC
    ', [$user['id']]);
    json_out(array_map('format_run', $runs));
}

function route_run_update($id)
{
    $run = get_own_run($id);
    if ($run['finished_at']) json_out(format_run($run));

    $total = steps_count((int) $run['guide_id']);
    $current = clamp(to_int(input('currentStep'), (int) $run['current_step']), 0, max(0, $total - 1));
    $checkedInput = input('checked');
    $checked = is_array($checkedInput)
        ? mb_substr(json_encode((object) $checkedInput, JSON_UNESCAPED_UNICODE), 0, 20000)
        : $run['checked'];

    q("UPDATE runs SET current_step = ?, max_step = MAX(max_step, ?), checked = ?, updated_at = datetime('now') WHERE id = ?",
        [$current, $current, $checked, (int) $run['id']]);
    json_out(format_run(one('SELECT * FROM runs WHERE id = ?', [(int) $run['id']])));
}

function route_run_events($id)
{
    $run = get_own_run($id);
    $events = is_array(input('events')) ? array_slice(input('events'), 0, 200) : [];
    $stepIds = array_map('intval', array_column(all('SELECT id FROM steps WHERE guide_id = ?', [(int) $run['guide_id']]), 'id'));
    $types = ['enter', 'complete', 'stuck'];

    $saved = 0;
    foreach ($events as $e) {
        if (!is_array($e)) continue;
        $stepId = to_int($e['stepId'] ?? null);
        $type = $e['type'] ?? null;
        if (!in_array($stepId, $stepIds, true) || !in_array($type, $types, true)) continue;

        $at = isset($e['at']) ? strtotime((string) $e['at']) : false;
        if ($at === false || $at > time()) $at = time();
        $duration = isset($e['durationMs']) ? clamp(to_int($e['durationMs']), 0, 3600000) : null;

        q('INSERT INTO step_events (run_id, step_id, type, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)',
            [(int) $run['id'], $stepId, $type, $duration, sql_date($at)]);
        $saved++;
    }

    q("UPDATE runs SET updated_at = datetime('now') WHERE id = ?", [(int) $run['id']]);
    json_out(['saved' => $saved]);
}

function route_run_finish($id)
{
    $run = get_own_run($id);
    $last = max(0, steps_count((int) $run['guide_id']) - 1);
    q("UPDATE runs SET finished_at = COALESCE(finished_at, datetime('now')), current_step = ?, max_step = ?,
         updated_at = datetime('now') WHERE id = ?", [$last, $last, (int) $run['id']]);
    json_out(format_run(one('SELECT * FROM runs WHERE id = ?', [(int) $run['id']])));
}

// ---------- комментарии и голоса ----------

const COMMENT_SQL = 'SELECT c.*, u.name AS author_name, u.role AS author_role FROM comments c JOIN users u ON u.id = c.user_id';

function find_step($stepId)
{
    $step = one('SELECT s.id, s.guide_id, g.status, g.author_id FROM steps s JOIN guides g ON g.id = s.guide_id WHERE s.id = ?', [$stepId]);
    if (!$step) throw not_found('Шаг не найден');
    return $step;
}

function route_comments_list($guideId)
{
    json_out(all(COMMENT_SQL . ' WHERE c.guide_id = ? ORDER BY c.created_at', [$guideId]));
}

function route_comment_create($stepId)
{
    $user = require_auth();
    $step = find_step($stepId);
    if ($step['status'] !== 'published' && (int) $step['author_id'] !== $user['id']) throw not_found('Шаг не найден');

    $body = str(input('body'), 2000);
    if (mb_strlen($body) < 2) throw new HttpError(400, 'Комментарий пустой');
    $kind = in_array(input('kind'), ['comment', 'improvement', 'question'], true) ? input('kind') : 'comment';

    q('INSERT INTO comments (guide_id, step_id, user_id, body, kind) VALUES (?, ?, ?, ?, ?)',
        [(int) $step['guide_id'], (int) $step['id'], $user['id'], $body, $kind]);
    json_out(one(COMMENT_SQL . ' WHERE c.id = ?', [last_id()]), 201);
}

function find_comment($id)
{
    $c = one('SELECT c.id, c.user_id, g.author_id FROM comments c JOIN guides g ON g.id = c.guide_id WHERE c.id = ?', [$id]);
    if (!$c) throw not_found('Комментарий не найден');
    return $c;
}

function route_comment_update($id)
{
    $user = require_auth();
    $c = find_comment($id);
    if ((int) $c['author_id'] !== $user['id']) throw new HttpError(403, 'Только автор инструкции');
    q('UPDATE comments SET resolved = ? WHERE id = ?', [input('resolved') ? 1 : 0, (int) $c['id']]);
    json_out(one(COMMENT_SQL . ' WHERE c.id = ?', [(int) $c['id']]));
}

function route_comment_delete($id)
{
    $user = require_auth();
    $c = find_comment($id);
    if ((int) $c['user_id'] !== $user['id'] && (int) $c['author_id'] !== $user['id']) {
        throw new HttpError(403, 'Нельзя удалить чужой комментарий');
    }
    q('DELETE FROM comments WHERE id = ?', [(int) $c['id']]);
    no_content();
}

function route_step_vote($stepId)
{
    $user = require_auth();
    $step = find_step($stepId);
    $value = to_int(input('value'));

    if ($value === 0) {
        q('DELETE FROM step_votes WHERE step_id = ? AND user_id = ?', [(int) $step['id'], $user['id']]);
    } elseif ($value === 1 || $value === -1) {
        q('INSERT INTO step_votes (step_id, user_id, value) VALUES (?, ?, ?)
           ON CONFLICT (step_id, user_id) DO UPDATE SET value = excluded.value', [(int) $step['id'], $user['id'], $value]);
    } else {
        throw new HttpError(400, 'value должен быть 1, -1 или 0');
    }

    $counts = one('SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM step_votes WHERE step_id = ?', [(int) $step['id']]);
    json_out(['up' => (int) $counts['up'], 'down' => (int) $counts['down'], 'myVote' => $value]);
}
