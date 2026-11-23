<?php
// Установка/обновление сайта на виртуальном хостинге одной ссылкой:
//   https://ваш-сайт/install.php?key=КЛЮЧ
// Скачивает готовую сборку из ветки hosting репозитория и раскладывает её в эту папку.
// База лежит отдельно (../data/app.db) и при обновлении не трогается.
// Ключ задаётся в файле install.key рядом (создаётся вручную на хостинге).

$keyFile = __DIR__ . '/install.key';
$key = file_exists($keyFile) ? trim(file_get_contents($keyFile)) : '';
if ($key === '' || !hash_equals($key, (string) ($_GET['key'] ?? ''))) {
    http_response_code(404);
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
set_time_limit(120);

$repo = 'deboshirx/poshagovo';
$branch = 'hosting';
$zipPath = __DIR__ . '/../update.zip';

// архив ветки codeload кэширует на несколько минут, поэтому качаем по хэшу последнего коммита
$ch = curl_init("https://api.github.com/repos/$repo/commits/$branch");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => ['User-Agent: poshagovo-installer', 'Accept: application/vnd.github.sha'],
]);
$sha = trim((string) curl_exec($ch));
$ref = preg_match('/^[0-9a-f]{40}$/', $sha) ? $sha : "refs/heads/$branch";
echo "Версия: $ref\n";

$ch = curl_init("https://codeload.github.com/$repo/zip/$ref");
$fp = fopen($zipPath, 'w');
curl_setopt_array($ch, [CURLOPT_FILE => $fp, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 90]);
curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
fclose($fp);
if ($code !== 200) exit("Не удалось скачать сборку: HTTP $code " . curl_error($ch));

$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) exit('Архив повреждён');

$root = $zip->getNameIndex(0); // poshagovo-hosting/
$count = 0;
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    $rel = substr($name, strlen($root));
    if ($rel === '' || $rel === false || strpos($rel, '..') !== false) continue;
    $dest = __DIR__ . '/' . $rel;
    if (substr($name, -1) === '/') {
        if (!is_dir($dest)) mkdir($dest, 0755, true);
        continue;
    }
    if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0755, true);
    file_put_contents($dest, $zip->getFromIndex($i));
    $count++;
}
$zip->close();
unlink($zipPath);

echo "Файлов обновлено: $count\n";

require __DIR__ . '/server/setup.php';
foreach (setup_database(isset($_GET['reset'])) as $line) echo $line, "\n";
echo "Готово\n";
