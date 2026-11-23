<?php
// Порт server/src/lib/search.js. Логика та же: стемминг, синонимы, опечатки.

const SEARCH_ENDINGS = [
    'ениями', 'ениях', 'ением', 'ость', 'остью', 'ости',
    'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'иях', 'ться', 'ешь', 'ете', 'ите',
    'ия', 'ие', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ов', 'ев', 'ей', 'ам', 'ям',
    'ах', 'ях', 'ом', 'ем', 'ою', 'ею', 'ую', 'юю', 'ть', 'ти', 'ся',
    'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
];

const SEARCH_STOP_WORDS = [
    'как', 'что', 'где', 'для', 'это', 'или', 'мне', 'мой', 'все', 'его', 'она', 'они', 'при',
    'про', 'над', 'под', 'без', 'если', 'чтобы', 'нужно', 'надо', 'можно', 'сделать', 'хочу',
    'the', 'and', 'how', 'to',
];

const SEARCH_RAW_SYNONYMS = [
    'докер' => 'docker', 'комп' => 'пк', 'компьютер' => 'пк', 'системник' => 'пк',
    'лаба' => 'лабораторная', 'лабораторка' => 'лабораторная', 'лабу' => 'лабораторная',
    'гит' => 'git', 'гитхаб' => 'github', 'винда' => 'windows', 'виндовс' => 'windows',
    'линукс' => 'linux', 'убунту' => 'ubuntu', 'видюха' => 'видеокарта', 'видеокарту' => 'видеокарта',
    'мать' => 'материнская', 'материнка' => 'материнская', 'проц' => 'процессор',
    'оперативка' => 'оперативная', 'ссш' => 'ssh', 'справочка' => 'справка', 'общага' => 'общежитие',
];

function search_stem($word)
{
    $len = mb_strlen($word);
    if (!preg_match('/[а-я]/u', $word) || $len <= 3) return $word;
    foreach (SEARCH_ENDINGS as $end) {
        $endLen = mb_strlen($end);
        if (mb_substr($word, -$endLen) === $end && $len - $endLen >= 3) {
            return mb_substr($word, 0, $len - $endLen);
        }
    }
    return $word;
}

function search_synonyms()
{
    static $map = null;
    if ($map === null) {
        $map = [];
        foreach (SEARCH_RAW_SYNONYMS as $k => $v) $map[search_stem($k)] = search_stem($v);
    }
    return $map;
}

function search_tokenize($text)
{
    $text = str_replace('ё', 'е', mb_strtolower((string) $text));
    $words = preg_split('/[^a-zа-я0-9+#]+/u', $text, -1, PREG_SPLIT_NO_EMPTY);
    $syn = search_synonyms();
    $out = [];
    foreach ($words as $w) {
        if (mb_strlen($w) <= 1 || in_array($w, SEARCH_STOP_WORDS, true)) continue;
        $s = search_stem($w);
        $out[] = $syn[$s] ?? $s;
    }
    return $out;
}

// встроенный levenshtein() считает байты, а у кириллицы два байта на букву
function search_levenshtein($a, $b)
{
    $a = preg_split('//u', $a, -1, PREG_SPLIT_NO_EMPTY);
    $b = preg_split('//u', $b, -1, PREG_SPLIT_NO_EMPTY);
    if (abs(count($a) - count($b)) > 2) return 99;
    $prev = range(0, count($b));
    for ($i = 1; $i <= count($a); $i++) {
        $cur = [$i];
        for ($j = 1; $j <= count($b); $j++) {
            $cur[$j] = min($prev[$j] + 1, $cur[$j - 1] + 1, $prev[$j - 1] + ($a[$i - 1] === $b[$j - 1] ? 0 : 1));
        }
        $prev = $cur;
    }
    return $prev[count($b)];
}

function search_word_score($q, $word)
{
    if ($q === $word) return 1;
    $len = mb_strlen($q);
    if ($len >= 3 && mb_strpos($word, $q) === 0) return 0.8;
    if ($len >= 4) {
        $allowed = $len >= 7 ? 2 : 1;
        if (search_levenshtein($q, $word) <= $allowed) return 0.6;
    }
    return 0;
}

function search_field_score(array $queryTokens, array $fieldTokens)
{
    $total = 0;
    $matched = 0;
    foreach ($queryTokens as $q) {
        $best = 0;
        foreach ($fieldTokens as $w) {
            $best = max($best, search_word_score($q, $w));
            if ($best === 1) break;
        }
        $total += $best;
        if ($best > 0) $matched++;
    }
    return [$total, $matched];
}

function search_guides($query, array $guides, array $stepsByGuide)
{
    $queryTokens = array_values(array_unique(search_tokenize($query)));
    if (!$queryTokens) return $guides;

    $weights = ['title' => 3, 'tags' => 2.5, 'description' => 1.5, 'step' => 1];
    $results = [];

    foreach ($guides as $guide) {
        $steps = $stepsByGuide[$guide['id']] ?? [];
        $score = 0;
        $tagsText = is_array($guide['tags']) ? implode(',', $guide['tags']) : $guide['tags'];

        foreach (['title' => $guide['title'], 'tags' => $tagsText, 'description' => $guide['description']] as $field => $text) {
            [$total] = search_field_score($queryTokens, search_tokenize($text));
            $score += $total * $weights[$field];
        }

        $bestStep = null;
        foreach ($steps as $step) {
            [$total] = search_field_score($queryTokens, search_tokenize($step['title'] . ' ' . $step['body']));
            if ($total > 0 && (!$bestStep || $total > $bestStep['total'])) {
                $bestStep = ['title' => $step['title'], 'total' => $total];
            }
        }
        if ($bestStep) $score += $bestStep['total'] * $weights['step'];

        $allText = $guide['title'] . ' ' . $tagsText . ' ' . $guide['description'];
        foreach ($steps as $s) $allText .= ' ' . $s['title'] . ' ' . $s['body'];
        $allTokens = search_tokenize($allText);
        $matchedWords = 0;
        foreach ($queryTokens as $q) {
            foreach ($allTokens as $w) {
                if (search_word_score($q, $w) > 0) { $matchedWords++; break; }
            }
        }

        $need = count($queryTokens) <= 2 ? count($queryTokens) : count($queryTokens) - 1;
        if ($matchedWords < $need || $score == 0) continue;

        [$titleHit] = search_field_score($queryTokens, search_tokenize($guide['title']));
        $guide['relevance'] = round($score, 1);
        $guide['match'] = !$titleHit && $bestStep ? ['step' => $bestStep['title']] : null;
        $results[] = $guide;
    }

    usort($results, function ($a, $b) {
        return [$b['relevance'], $b['usefulness']] <=> [$a['relevance'], $a['usefulness']];
    });
    return $results;
}
