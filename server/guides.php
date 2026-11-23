<?php
// Порт server/src/routes/guides.js

const LIST_SQL = "
  SELECT g.*, u.name AS author_name, u.role AS author_role,
    p.title AS parent_title, v.name AS verified_by_name,
    (SELECT COUNT(*) FROM steps s WHERE s.guide_id = g.id) AS steps_count,
    (SELECT COALESCE(SUM(minutes), 0) FROM steps s WHERE s.guide_id = g.id) AS minutes,
    (SELECT COUNT(*) FROM runs r WHERE r.guide_id = g.id) AS runs_count,
    (SELECT COUNT(*) FROM runs r WHERE r.guide_id = g.id AND r.finished_at IS NOT NULL) AS finished_count,
    (SELECT AVG(stars) FROM ratings ra WHERE ra.guide_id = g.id) AS rating,
    (SELECT COUNT(*) FROM ratings ra WHERE ra.guide_id = g.id) AS rating_count,
    (SELECT COUNT(*) FROM guides f WHERE f.forked_from = g.id AND f.status = 'published') AS forks_count
  FROM guides g
  JOIN users u ON u.id = g.author_id
  LEFT JOIN guides p ON p.id = g.forked_from
  LEFT JOIN users v ON v.id = g.verified_by
";

function with_usefulness(array $g)
{
    foreach (['id', 'author_id', 'steps_count', 'minutes', 'runs_count', 'finished_count', 'rating_count', 'forks_count'] as $k) {
        $g[$k] = (int) $g[$k];
    }
    $g['forked_from'] = $g['forked_from'] === null ? null : (int) $g['forked_from'];
    $g['verified_by'] = $g['verified_by'] === null ? null : (int) $g['verified_by'];

    $n = $g['rating_count'];
    $avg = $g['rating'] === null ? 0 : (float) $g['rating'];
    $bayes = (3 * 3.5 + $avg * $n) / (3 + $n);
    $completion = $g['runs_count'] ? $g['finished_count'] / $g['runs_count'] : 0;

    $g['tags'] = $g['tags'] !== '' ? explode(',', $g['tags']) : [];
    $g['rating'] = $g['rating'] === null ? null : round($avg, 1);
    $g['usefulness'] = (int) round(($bayes / 5) * 70 + $completion * 30);
    $g['verified'] = (bool) $g['verified_by'];
    return $g;
}

function find_guide($id)
{
    $g = one(LIST_SQL . ' WHERE g.id = ?', [$id]);
    if (!$g || ($g['status'] !== 'published' && (int) $g['author_id'] !== user_id())) {
        throw not_found('Инструкция не найдена');
    }
    return with_usefulness($g);
}

function find_own_guide($id)
{
    $user = require_auth();
    $g = find_guide($id);
    if ($g['author_id'] !== $user['id']) throw new HttpError(403, 'Это не ваша инструкция');
    return $g;
}

function load_steps($guideId)
{
    return array_map(function ($s) {
        $s['checklist'] = json_decode($s['checklist'], true) ?: [];
        return $s;
    }, all('SELECT * FROM steps WHERE guide_id = ? ORDER BY position', [$guideId]));
}

function route_categories()
{
    $counts = [];
    foreach (all("SELECT category, COUNT(*) AS n FROM guides WHERE status = 'published' GROUP BY category") as $r) {
        $counts[$r['category']] = (int) $r['n'];
    }
    json_out(array_map(function ($c) use ($counts) {
        return $c + ['count' => $counts[$c['id']] ?? 0];
    }, CATEGORIES));
}

function route_guides_list()
{
    $q = str($_GET['q'] ?? '', 200);
    $category = $_GET['category'] ?? null;
    $sort = $_GET['sort'] ?? 'useful';

    $where = [];
    $params = [];
    if (!empty($_GET['mine'])) {
        $user = require_auth();
        $where[] = 'g.author_id = ?';
        $params[] = $user['id'];
    } else {
        $where[] = "g.status = 'published'";
    }
    if ($category && $category !== 'all') {
        $where[] = 'g.category = ?';
        $params[] = $category;
    }

    $guides = array_map('with_usefulness', all(LIST_SQL . ' WHERE ' . implode(' AND ', $where), $params));

    if ($q !== '') {
        $stepsByGuide = [];
        foreach (all('SELECT guide_id, title, body FROM steps') as $s) $stepsByGuide[(int) $s['guide_id']][] = $s;
        $guides = search_guides($q, $guides, $stepsByGuide);
    } else {
        $sorts = [
            'useful' => function ($a, $b) { return $b['usefulness'] <=> $a['usefulness']; },
            'popular' => function ($a, $b) { return $b['runs_count'] <=> $a['runs_count']; },
            'rating' => function ($a, $b) { return [$b['rating'] ?? 0, $b['rating_count']] <=> [$a['rating'] ?? 0, $a['rating_count']]; },
            'new' => function ($a, $b) { return strcmp($b['created_at'], $a['created_at']); },
            'short' => function ($a, $b) { return $a['minutes'] <=> $b['minutes']; },
        ];
        usort($guides, $sorts[$sort] ?? $sorts['useful']);
    }

    json_out($guides);
}

function route_guide_get($id)
{
    $guide = find_guide($id);
    $uid = user_id();

    $votes = [];
    foreach (all('
        SELECT step_id, SUM(value = 1) AS up, SUM(value = -1) AS down FROM step_votes
        WHERE step_id IN (SELECT id FROM steps WHERE guide_id = ?) GROUP BY step_id
    ', [$guide['id']]) as $r) {
        $votes[$r['step_id']] = $r;
    }
    $myVotes = [];
    if ($uid) {
        foreach (all('
            SELECT step_id, value FROM step_votes
            WHERE user_id = ? AND step_id IN (SELECT id FROM steps WHERE guide_id = ?)
        ', [$uid, $guide['id']]) as $r) {
            $myVotes[$r['step_id']] = (int) $r['value'];
        }
    }
    $commentCounts = [];
    foreach (all('SELECT step_id, COUNT(*) AS n FROM comments WHERE guide_id = ? GROUP BY step_id', [$guide['id']]) as $r) {
        $commentCounts[$r['step_id']] = (int) $r['n'];
    }

    $forks = all("
        SELECT g.id, g.title, g.updated_at, u.name AS author_name,
          (SELECT AVG(stars) FROM ratings WHERE guide_id = g.id) AS rating
        FROM guides g JOIN users u ON u.id = g.author_id
        WHERE g.forked_from = ? AND g.status = 'published'
        ORDER BY rating DESC
    ", [$guide['id']]);

    $myRating = null;
    if ($uid) {
        $r = one('SELECT stars FROM ratings WHERE guide_id = ? AND user_id = ?', [$guide['id'], $uid]);
        $myRating = $r ? (int) $r['stars'] : null;
    }

    $guide['steps'] = array_map(function ($s) use ($votes, $myVotes, $commentCounts) {
        $s['up'] = (int) ($votes[$s['id']]['up'] ?? 0);
        $s['down'] = (int) ($votes[$s['id']]['down'] ?? 0);
        $s['myVote'] = $myVotes[$s['id']] ?? 0;
        $s['commentsCount'] = $commentCounts[$s['id']] ?? 0;
        return $s;
    }, load_steps($guide['id']));
    $guide['forks'] = $forks;
    $guide['myRating'] = $myRating;

    json_out($guide);
}

function read_guide_input()
{
    $title = str(input('title'), 120);
    if (mb_strlen($title) < 3) throw new HttpError(400, 'Название должно быть не короче 3 символов');

    $rawSteps = is_array(input('steps')) ? input('steps') : [];
    if (count($rawSteps) > 100) throw new HttpError(400, 'Слишком много шагов (максимум 100)');

    $status = input('status') === 'published' ? 'published' : 'draft';
    if ($status === 'published' && !$rawSteps) throw new HttpError(400, 'Нельзя опубликовать инструкцию без шагов');

    $rawTags = input('tags');
    $tags = is_array($rawTags) ? $rawTags : explode(',', (string) $rawTags);
    $tags = array_slice(array_values(array_filter(array_map(function ($t) {
        return mb_strtolower(str($t, 30));
    }, $tags))), 0, 10);

    $category = input('category');
    $validCategory = in_array($category, array_column(CATEGORIES, 'id'), true);
    $difficulty = input('difficulty');

    $steps = [];
    foreach (array_values($rawSteps) as $i => $s) {
        $s = is_array($s) ? $s : [];
        $checklist = is_array($s['checklist'] ?? null) ? $s['checklist'] : [];
        $steps[] = [
            'id' => to_int($s['id'] ?? null, null),
            'title' => str($s['title'] ?? '', 200) ?: 'Шаг ' . ($i + 1),
            'body' => str($s['body'] ?? '', 10000),
            'tip' => str($s['tip'] ?? '', 500),
            'minutes' => clamp(to_int($s['minutes'] ?? null, 5), 1, 600),
            'checklist' => array_slice(array_values(array_filter(array_map(function ($c) { return str($c, 300); }, $checklist))), 0, 30),
        ];
    }

    return [
        'title' => $title,
        'description' => str(input('description'), 2000),
        'category' => $validCategory ? $category : 'other',
        'tags' => implode(',', array_unique($tags)),
        'cover' => str(input('cover'), 8) ?: '📋',
        'difficulty' => in_array($difficulty, ['easy', 'medium', 'hard'], true) ? $difficulty : 'easy',
        'status' => $status,
        'steps' => $steps,
    ];
}

// шаги обновляем по id, чтобы не терять комментарии и статистику (см. guides.js)
function save_steps($guideId, array $steps)
{
    $existing = array_map('intval', array_column(all('SELECT id FROM steps WHERE guide_id = ?', [$guideId]), 'id'));
    $kept = [];
    foreach ($steps as $position => $s) {
        $checklist = json_encode($s['checklist'], JSON_UNESCAPED_UNICODE);
        if ($s['id'] && in_array($s['id'], $existing, true)) {
            q('UPDATE steps SET position = ?, title = ?, body = ?, checklist = ?, tip = ?, minutes = ? WHERE id = ?',
                [$position, $s['title'], $s['body'], $checklist, $s['tip'], $s['minutes'], $s['id']]);
            $kept[] = $s['id'];
        } else {
            q('INSERT INTO steps (guide_id, position, title, body, checklist, tip, minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$guideId, $position, $s['title'], $s['body'], $checklist, $s['tip'], $s['minutes']]);
        }
    }
    foreach ($existing as $id) {
        if (!in_array($id, $kept, true)) q('DELETE FROM steps WHERE id = ?', [$id]);
    }
}

function route_guide_create()
{
    $user = require_auth();
    $d = read_guide_input();
    $id = tx(function () use ($user, $d) {
        q('INSERT INTO guides (author_id, title, description, category, tags, cover, difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$user['id'], $d['title'], $d['description'], $d['category'], $d['tags'], $d['cover'], $d['difficulty'], $d['status']]);
        $guideId = last_id();
        save_steps($guideId, $d['steps']);
        return $guideId;
    });
    json_out(['id' => $id], 201);
}

function route_guide_update($id)
{
    $guide = find_own_guide($id);
    $d = read_guide_input();
    tx(function () use ($guide, $d) {
        q("UPDATE guides SET title = ?, description = ?, category = ?, tags = ?, cover = ?, difficulty = ?, status = ?,
             updated_at = datetime('now') WHERE id = ?",
            [$d['title'], $d['description'], $d['category'], $d['tags'], $d['cover'], $d['difficulty'], $d['status'], $guide['id']]);
        save_steps($guide['id'], $d['steps']);
    });
    json_out(['id' => $guide['id']]);
}

function route_guide_delete($id)
{
    $guide = find_own_guide($id);
    q('DELETE FROM guides WHERE id = ?', [$guide['id']]);
    no_content();
}

function route_guide_fork($id)
{
    $user = require_auth();
    $source = find_guide($id);
    $steps = load_steps($source['id']);

    $newId = tx(function () use ($user, $source, $steps) {
        q("INSERT INTO guides (author_id, title, description, category, tags, cover, difficulty, status, forked_from)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)",
            [$user['id'], $source['title'], $source['description'], $source['category'], implode(',', $source['tags']),
                $source['cover'], $source['difficulty'], $source['id']]);
        $guideId = last_id();
        save_steps($guideId, array_map(function ($s) {
            return ['id' => null, 'title' => $s['title'], 'body' => $s['body'], 'tip' => $s['tip'],
                'minutes' => (int) $s['minutes'], 'checklist' => $s['checklist']];
        }, $steps));
        return $guideId;
    });

    json_out(['id' => $newId], 201);
}

function route_guide_rate($id)
{
    $user = require_auth();
    $guide = find_guide($id);
    $stars = to_int(input('stars'));
    if ($stars < 1 || $stars > 5) throw new HttpError(400, 'Оценка от 1 до 5');
    if ($guide['author_id'] === $user['id']) throw new HttpError(400, 'Свою инструкцию оценивать нельзя');

    q("INSERT INTO ratings (guide_id, user_id, stars) VALUES (?, ?, ?)
       ON CONFLICT (guide_id, user_id) DO UPDATE SET stars = excluded.stars, created_at = datetime('now')",
        [$guide['id'], $user['id'], $stars]);

    $updated = find_guide($guide['id']);
    json_out(['rating' => $updated['rating'], 'rating_count' => $updated['rating_count'], 'myRating' => $stars]);
}

function route_guide_verify($id)
{
    $user = require_expert();
    $guide = find_guide($id);
    $verifiedBy = $guide['verified_by'] ? null : $user['id'];
    q('UPDATE guides SET verified_by = ? WHERE id = ?', [$verifiedBy, $guide['id']]);
    json_out(['verified' => (bool) $verifiedBy, 'verified_by_name' => $verifiedBy ? $user['name'] : null]);
}

function route_guide_stats($id)
{
    $guide = find_own_guide($id);
    $feedback = all("
        SELECT c.id, c.body, c.kind, c.resolved, c.created_at, c.step_id, s.title AS step_title, s.position,
          u.name AS author_name, u.role AS author_role
        FROM comments c
        JOIN steps s ON s.id = c.step_id
        JOIN users u ON u.id = c.user_id
        WHERE c.guide_id = ? AND c.kind IN ('improvement', 'question')
        ORDER BY c.resolved, c.created_at DESC
        LIMIT 50
    ", [$guide['id']]);

    json_out(array_merge(
        ['guide' => [
            'id' => $guide['id'], 'title' => $guide['title'],
            'rating' => $guide['rating'], 'rating_count' => $guide['rating_count'],
        ]],
        guide_analytics($guide['id']),
        ['feedback' => $feedback]
    ));
}
