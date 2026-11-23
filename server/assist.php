<?php
// Порт server/src/lib/assist.js — разбивка текста на шаги

const STEP_START = '/^\s*(?:шаг\s*\d+\s*[.:)-]?|step\s*\d+\s*[.:)-]?|\d{1,2}\s*[.)]\s+|#{1,3}\s+)/iu';
const BULLET = '/^\s*(?:[-*•–]|\[\s?\])\s+/u';

function first_sentence($text)
{
    if (preg_match('/^(.{10,90}?[.!?:])(\s|$)/u', $text, $m)) return preg_replace('/[.:]$/u', '', $m[1]);
    return mb_substr($text, 0, 80);
}

function estimate_minutes(array $step)
{
    $words = count(preg_split('/\s+/u', trim($step['body'] . ' ' . implode(' ', $step['checklist'])), -1, PREG_SPLIT_NO_EMPTY));
    return max(2, min(60, (int) round($words / 30) + count($step['checklist']) * 2));
}

function finalize_step(array $step)
{
    $title = trim($step['title']);
    $body = trim($step['body']);
    $short = first_sentence($title);
    if (mb_strlen($short) < mb_strlen($title) - 1) {
        $rest = preg_replace('/^[.:!?]\s*/u', '', mb_substr($title, mb_strlen($short)));
        $body = trim($rest . "\n" . $body);
        $title = $short;
    }
    $result = ['title' => $title, 'body' => $body, 'checklist' => $step['checklist'], 'tip' => ''];
    $result['minutes'] = estimate_minutes($result);
    return $result;
}

function split_by_rules($text)
{
    $lines = explode("\n", str_replace("\r", '', $text));
    $steps = [];
    $cur = -1;

    foreach ($lines as $raw) {
        $line = rtrim($raw);
        if (trim($line) === '') {
            if ($cur >= 0) $steps[$cur]['body'] .= "\n";
            continue;
        }
        if (preg_match(STEP_START, $line)) {
            $steps[] = ['title' => trim(preg_replace(STEP_START, '', $line)), 'body' => '', 'checklist' => []];
            $cur = count($steps) - 1;
            continue;
        }
        if ($cur < 0) {
            $t = first_sentence(trim($line));
            $steps[] = ['title' => $t, 'body' => $t !== trim($line) ? trim($line) . "\n" : '', 'checklist' => []];
            $cur = 0;
            continue;
        }
        if (preg_match(BULLET, $line)) {
            $steps[$cur]['checklist'][] = trim(preg_replace(BULLET, '', $line));
        } else {
            $steps[$cur]['body'] .= trim($line) . "\n";
        }
    }

    if (count($steps) <= 1) {
        $paragraphs = array_values(array_filter(array_map('trim', preg_split('/\n\s*\n/u', $text))));
        if (count($paragraphs) > 1) {
            return array_map(function ($p) {
                $checklist = [];
                $bodyLines = [];
                foreach (explode("\n", $p) as $l) {
                    if (preg_match(BULLET, $l)) $checklist[] = trim(preg_replace(BULLET, '', $l));
                    else $bodyLines[] = trim($l);
                }
                $joined = implode(' ', $bodyLines);
                $title = first_sentence($joined);
                $body = preg_replace('/^[.:!?]\s*/u', '', mb_substr($joined, mb_strlen($title)));
                return finalize_step(['title' => $title, 'body' => $body, 'checklist' => $checklist]);
            }, $paragraphs);
        }
    }

    $steps = array_filter($steps, function ($s) { return $s['title'] !== '' || $s['body'] !== ''; });
    return array_values(array_map('finalize_step', $steps));
}

function split_with_ai($text)
{
    $key = getenv('ANTHROPIC_API_KEY');
    if (!$key) return null;

    $prompt = "Ты помогаешь автору сервиса пошаговых инструкций.\n"
        . "Разбей текст ниже на шаги. Для каждого шага дай короткий заголовок (повелительное наклонение),\n"
        . "пояснение, чек-лист из 1-5 конкретных проверяемых пунктов, совет (может быть пустым) и оценку в минутах.\n"
        . "Ответь ТОЛЬКО JSON-массивом вида:\n"
        . '[{"title": "...", "body": "...", "checklist": ["..."], "tip": "...", "minutes": 5}]' . "\n\nТекст:\n";

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01', 'content-type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => getenv('AI_MODEL') ?: 'claude-haiku-5-5',
            'max_tokens' => 4000,
            'messages' => [['role' => 'user', 'content' => $prompt . $text]],
        ]),
    ]);
    $res = curl_exec($ch);
    if ($res === false || curl_getinfo($ch, CURLINFO_RESPONSE_CODE) !== 200) return null;

    $data = json_decode($res, true);
    $answer = '';
    foreach ($data['content'] ?? [] as $c) if (($c['type'] ?? '') === 'text') $answer = $c['text'];
    $start = strpos($answer, '[');
    $end = strrpos($answer, ']');
    if ($start === false || $end === false) return null;
    $steps = json_decode(substr($answer, $start, $end - $start + 1), true);
    if (!is_array($steps) || !$steps) return null;

    return array_map(function ($s) {
        return [
            'title' => mb_substr((string) ($s['title'] ?? ''), 0, 200),
            'body' => (string) ($s['body'] ?? ''),
            'checklist' => array_slice(array_map('strval', (array) ($s['checklist'] ?? [])), 0, 10),
            'tip' => (string) ($s['tip'] ?? ''),
            'minutes' => (int) ($s['minutes'] ?? 5) ?: 5,
        ];
    }, $steps);
}

function route_assist_status()
{
    json_out(['ai' => (bool) getenv('ANTHROPIC_API_KEY')]);
}

function route_assist_split()
{
    require_auth();
    $text = is_string(input('text')) ? mb_substr(input('text'), 0, 20000) : '';
    if (mb_strlen(trim($text)) < 20) throw new HttpError(400, 'Вставьте текст подлиннее');

    $ai = split_with_ai($text);
    if ($ai) json_out(['source' => 'ai', 'steps' => $ai]);
    json_out(['source' => 'rules', 'steps' => split_by_rules($text)]);
}
