<?php
// feedback.php — relay for the "Give feedback" dialog (ctsizer-feedback.jsx).
//
// The browser POSTs {title, body} as JSON; this script creates the issue in
// the CTSizer repository with a fine-grained GitHub token (Issues: read and
// write on that one private repository) that never reaches the browser. The
// token comes from feedback-config.php (written by the deploy workflow from
// the FEEDBACK_GITHUB_TOKEN secret, never committed, never served: see
// .htaccess) or the CTSIZER_FEEDBACK_TOKEN environment variable.
//
// Abuse limits: only same-site JSON POSTs, capped size, and at most
// PER_IP_HOUR reports per visitor per hour and PER_DAY reports in total per
// day (both can be raised in feedback-config.php: 'per_ip_hour', 'per_day');
// an IPv6 visitor counts per /64. Visitors are stored as salted hashes, never
// as raw IP addresses.
// @mentions in the report are neutralised so a report cannot notify
// arbitrary GitHub users from the site's account.
declare(strict_types=1);

const REPO        = 'maar0005/CTSizer-dev';   // private: reports may hold an email
const ORIGINS     = ['https://ctsizer.com', 'https://www.ctsizer.com'];
const MAX_TITLE   = 256;
const MAX_BODY    = 60000;     // characters; GitHub caps an issue body at 65 536
const MAX_REQUEST = 300000;    // bytes of raw request
const PER_IP_HOUR = 5;
const PER_DAY     = 50;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function config(): array {
    $file = __DIR__ . '/feedback-config.php';
    $cfg = is_file($file) ? (include $file) : [];
    if (!is_array($cfg)) $cfg = [];
    $env = getenv('CTSIZER_FEEDBACK_TOKEN');
    if (empty($cfg['token']) && $env) $cfg['token'] = $env;
    // Salt for the visitor hashes and the name of the rate-limit directory: a
    // dedicated 'salt' in the config, else derived from the token (so the
    // token itself is never used as a salt).
    if (empty($cfg['salt']) && !empty($cfg['token'])) $cfg['salt'] = hash('sha256', 'ctsizer-feedback-salt|' . $cfg['token']);
    return $cfg;
}

// Sliding-window limits kept in one JSON file under an exclusive lock, in a
// private directory whose name cannot be guessed without the salt.
function rate_limited(string $visitor, string $salt, int $perIpHour, int $perDay): bool {
    $dir = sys_get_temp_dir() . '/ctsizer-feedback-' . substr(hash('sha256', 'dir|' . $salt), 0, 16);
    $old = umask(077);
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $fh = @fopen($dir . '/rate.json', 'c+');
    umask($old);
    if (!$fh) return false;                       // no storage: do not block feedback
    flock($fh, LOCK_EX);
    $now = time();
    $data = json_decode(stream_get_contents($fh) ?: '{}', true) ?: [];
    foreach ($data as $k => $times) {
        $data[$k] = array_values(array_filter($times, fn($t) => $t > $now - 86400));
        if (!$data[$k]) unset($data[$k]);
    }
    $mine = array_filter($data[$visitor] ?? [], fn($t) => $t > $now - 3600);
    $dayFull = count($data['*'] ?? []) >= $perDay;
    $limited = count($mine) >= $perIpHour || $dayFull;
    if (!$limited) {
        $data[$visitor][] = $now;
        $data['*'][] = $now;
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    flock($fh, LOCK_UN);
    fclose($fh);
    if ($dayFull) error_log('ctsizer feedback: daily cap reached, report refused');
    return $limited;
}

function github(string $url, string $token, array $payload): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $token,
            'Accept: application/vnd.github+json',
            'X-GitHub-Api-Version: 2022-11-28',
            'Content-Type: application/json',
            'User-Agent: ctsizer-feedback',
        ],
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    return [$status, is_string($raw) ? (json_decode($raw, true) ?: []) : []];
}

// "@name" would notify that GitHub user; a zero-width space after the @ keeps
// the text readable and stops the mention. An @ written as an HTML entity
// (&#64; &#x40; &commat;) becomes one in the rendered issue, so it is turned
// into a plain @ first. Control characters are dropped.
function neutralise(string $s): string {
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = preg_replace('/&(?:#0*64;?|#[xX]0*40;?|commat;)/u', '@', $s) ?? $s;
    return preg_replace('/@(?=[A-Za-z0-9])/u', "@\u{200B}", $s) ?? $s;
}

// Rate-limit key for an address: an IPv6 visitor usually holds a whole /64,
// so IPv6 addresses count per /64 (otherwise one visitor could use up the
// daily cap alone). IPv4 and IPv4-mapped addresses count per address.
function visitor_net(string $ip): string {
    $bin = @inet_pton($ip);
    if ($bin === false || strlen($bin) !== 16 || str_starts_with($bin, str_repeat("\0", 10) . "\xff\xff")) return $ip;
    return inet_ntop(substr($bin, 0, 8) . str_repeat("\0", 8)) . '/64';
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['error' => 'method']);

$cfg = config();
$origins = array_merge(ORIGINS, $cfg['origins'] ?? []);
if (!in_array($_SERVER['HTTP_ORIGIN'] ?? '', $origins, true)) reply(403, ['error' => 'origin']);
// Browsers that send Sec-Fetch-Site must say the request is same-origin.
$site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
if ($site !== '' && $site !== 'same-origin') reply(403, ['error' => 'origin']);
// A JSON content type cannot be sent cross-site without a CORS preflight,
// which this script never approves.
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) reply(415, ['error' => 'content_type']);
if (empty($cfg['token'])) reply(503, ['error' => 'not_configured']);

$raw = file_get_contents('php://input', false, null, 0, MAX_REQUEST + 1);
if ($raw === false || strlen($raw) > MAX_REQUEST) reply(413, ['error' => 'too_large']);
$in = json_decode($raw, true, 32);
$title = is_array($in) && is_string($in['title'] ?? null) ? trim($in['title']) : '';
$body  = is_array($in) && is_string($in['body'] ?? null) ? $in['body'] : '';
if ($title === '' || trim($body) === '') reply(400, ['error' => 'empty']);
if (!mb_check_encoding($title, 'UTF-8') || !mb_check_encoding($body, 'UTF-8')) reply(400, ['error' => 'encoding']);
if (mb_strlen($title) > MAX_TITLE || mb_strlen($body) > MAX_BODY) reply(413, ['error' => 'too_large']);
$title = neutralise(str_replace(["\r", "\n"], ' ', $title));
$body  = neutralise($body);

$visitor = hash('sha256', $cfg['salt'] . '|' . visitor_net($_SERVER['REMOTE_ADDR'] ?? ''));
if (rate_limited($visitor, $cfg['salt'], (int) ($cfg['per_ip_hour'] ?? PER_IP_HOUR), (int) ($cfg['per_day'] ?? PER_DAY)))
    reply(429, ['error' => 'rate_limited']);

$api = ($cfg['api'] ?? 'https://api.github.com') . '/repos/' . REPO . '/issues';
$issue = [
    'title'  => $title,
    'body'   => $body . "\n\n---\n_Sent from the CTSizer feedback form._",
    'labels' => ['feedback'],
];
[$status, $res] = github($api, $cfg['token'], $issue);
if ($status === 422) {                            // label rejected: retry without it
    unset($issue['labels']);
    [$status, $res] = github($api, $cfg['token'], $issue);
}
if ($status !== 201 || !isset($res['number'])) {
    error_log('ctsizer feedback: GitHub answered ' . $status . ' ' . ($res['message'] ?? ''));
    reply(502, ['error' => 'github']);
}
reply(200, ['ok' => true, 'number' => $res['number']]);
