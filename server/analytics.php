<?php
// Порт server/src/lib/analytics.js

const STALE_SECONDS = 86400;

function analytics_median(array $values)
{
    if (!$values) return null;
    sort($values);
    $n = count($values);
    $mid = intdiv($n, 2);
    return $n % 2 ? $values[$mid] : (int) round(($values[$mid - 1] + $values[$mid]) / 2);
}

function guide_analytics($guideId)
{
    $steps = all('SELECT id, position, title, minutes FROM steps WHERE guide_id = ? ORDER BY position', [$guideId]);
    $runs = all('SELECT id, max_step, started_at, updated_at, finished_at FROM runs WHERE guide_id = ?', [$guideId]);

    $now = time();
    $finished = array_values(array_filter($runs, function ($r) { return $r['finished_at']; }));
    $abandoned = array_values(array_filter($runs, function ($r) use ($now) {
        return !$r['finished_at'] && $now - parse_sql_date($r['updated_at']) > STALE_SECONDS;
    }));
    $active = count($runs) - count($finished) - count($abandoned);

    $durations = [];
    foreach (all("
        SELECT e.step_id, e.duration_ms FROM step_events e JOIN steps s ON s.id = e.step_id
        WHERE s.guide_id = ? AND e.type = 'complete' AND e.duration_ms IS NOT NULL
    ", [$guideId]) as $row) {
        $durations[$row['step_id']][] = (int) $row['duration_ms'];
    }

    $stuck = [];
    foreach (all("
        SELECT e.step_id, COUNT(*) AS n FROM step_events e JOIN steps s ON s.id = e.step_id
        WHERE s.guide_id = ? AND e.type = 'stuck' GROUP BY e.step_id
    ", [$guideId]) as $row) {
        $stuck[$row['step_id']] = (int) $row['n'];
    }

    $votes = [];
    foreach (all('
        SELECT v.step_id, SUM(v.value = 1) AS up, SUM(v.value = -1) AS down
        FROM step_votes v JOIN steps s ON s.id = v.step_id WHERE s.guide_id = ? GROUP BY v.step_id
    ', [$guideId]) as $row) {
        $votes[$row['step_id']] = $row;
    }

    $comments = [];
    foreach (all("
        SELECT step_id, COUNT(*) AS n, SUM(kind = 'improvement') AS improvements
        FROM comments WHERE guide_id = ? GROUP BY step_id
    ", [$guideId]) as $row) {
        $comments[$row['step_id']] = $row;
    }

    $stepStats = [];
    foreach ($steps as $i => $step) {
        $reached = count(array_filter($runs, function ($r) use ($i) { return $r['finished_at'] || (int) $r['max_step'] >= $i; }));
        $leftHere = count(array_filter($abandoned, function ($r) use ($i) { return (int) $r['max_step'] === $i; }));
        $v = $votes[$step['id']] ?? ['up' => 0, 'down' => 0];
        $c = $comments[$step['id']] ?? ['n' => 0, 'improvements' => 0];
        $stuckCount = $stuck[$step['id']] ?? 0;
        $up = (int) $v['up'];
        $down = (int) $v['down'];
        $medianMs = analytics_median($durations[$step['id']] ?? []);
        $planned = (int) $step['minutes'];
        $dropRate = $reached ? $leftHere / $reached : 0;

        $stuckRate = $reached ? $stuckCount / $reached : 0;
        $negative = $up + $down ? $down / ($up + $down) : 0;
        $overtime = $medianMs ? max(0, $medianMs / 60000 / $planned - 1) : 0;
        $problemScore = round(($dropRate * 50 + min($stuckRate, 1) * 25 + $negative * 15 + min($overtime, 1) * 10), 1);

        $stepStats[] = [
            'id' => (int) $step['id'],
            'position' => $i,
            'title' => $step['title'],
            'plannedMinutes' => $planned,
            'reached' => $reached,
            'leftHere' => $leftHere,
            'dropRate' => $dropRate,
            'medianMs' => $medianMs,
            'stuck' => $stuckCount,
            'up' => $up,
            'down' => $down,
            'comments' => (int) $c['n'],
            'improvements' => (int) $c['improvements'],
            'problemScore' => $problemScore,
        ];
    }

    $bottlenecks = array_values(array_filter($stepStats, function ($s) { return $s['problemScore'] >= 8 && $s['reached'] >= 3; }));
    usort($bottlenecks, function ($a, $b) { return $b['problemScore'] <=> $a['problemScore']; });
    $bottlenecks = array_map(function ($s) {
        $s['reasons'] = analytics_explain($s);
        return $s;
    }, array_slice($bottlenecks, 0, 3));

    $daily = [];
    for ($d = 13; $d >= 0; $d--) {
        $day = gmdate('Y-m-d', $now - $d * 86400);
        $daily[] = [
            'day' => $day,
            'started' => count(array_filter($runs, function ($r) use ($day) { return strpos($r['started_at'], $day) === 0; })),
            'finished' => count(array_filter($finished, function ($r) use ($day) { return strpos($r['finished_at'], $day) === 0; })),
        ];
    }

    $totalMs = array_map(function ($r) {
        return (parse_sql_date($r['finished_at']) - parse_sql_date($r['started_at'])) * 1000;
    }, $finished);

    return [
        'summary' => [
            'runs' => count($runs),
            'finished' => count($finished),
            'abandoned' => count($abandoned),
            'active' => $active,
            'completionRate' => $runs ? count($finished) / count($runs) : 0,
            'medianTotalMs' => analytics_median($totalMs),
        ],
        'steps' => $stepStats,
        'bottlenecks' => $bottlenecks,
        'daily' => $daily,
    ];
}

function analytics_explain(array $s)
{
    $reasons = [];
    if ($s['leftHere']) $reasons[] = "здесь бросили {$s['leftHere']} из {$s['reached']} (" . round($s['dropRate'] * 100) . '%)';
    if ($s['stuck']) $reasons[] = "«Не получается» нажимали {$s['stuck']} раз";
    if ($s['medianMs'] && $s['medianMs'] > $s['plannedMinutes'] * 60000 * 1.3) {
        $reasons[] = 'в среднем ' . round($s['medianMs'] / 60000) . " мин вместо {$s['plannedMinutes']}";
    }
    if ($s['down'] > $s['up']) $reasons[] = '«не полезно» отметили чаще, чем «полезно»';
    return $reasons;
}
