<?php
/**
 * سرویس همگام‌سازی تلیفت — نسخهٔ قابل اجرا روی هاست اشتراکی (cPanel/DirectAdmin)
 *
 * این فایل یک انبار کلید-مقدار ساده است که جایگزین سوپابیس می‌شود:
 *   GET  ?prefix=tlift_&token=...   → فهرست رکوردها با پیشوند
 *   GET  ?key=نام‌کلید&token=...     → یک رکورد
 *   POST {key, data, updated_at}    → ذخیره/به‌روزرسانی رکورد
 *
 * ⚠️ بعد از آپلود روی هاست، حتماً SYNC_TOKEN را عوض کنید.
 */

define('SYNC_TOKEN', 'tlift-asemansara-1405'); // ← این رمز را عوض کنید
define('DATA_DIR', __DIR__ . '/sync_data');
define('MAX_BODY_BYTES', 8 * 1024 * 1024);
define('BACKUP_DIR', __DIR__ . '/sync_data' . '/backups');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store');

// فشرده‌سازی خروجی با gzip برای کاهش ۲۰ برابری حجم تبادل داده در شبکه موبایل
if (!in_array('ob_gzhandler', ob_list_handlers()) && function_exists('ob_gzhandler') && !ini_get('zlib.output_compression')) {
    @ob_start('ob_gzhandler');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- احراز هویت توکن مستقل دستگاه (با سازگاری موقت توکن قدیمی) ---
$token = isset($_GET['token']) ? (string)$_GET['token'] : '';
if ($token === '' && isset($_SERVER['HTTP_AUTHORIZATION'])) $token = trim(str_ireplace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']));
if (!is_dir(DATA_DIR)) { @mkdir(DATA_DIR, 0755, true); }
$tokenFile = DATA_DIR . '/device_tokens.json';
$tokens = is_file($tokenFile) ? (json_decode((string)file_get_contents($tokenFile), true) ?: []) : [];
$actionEarly = isset($_GET['action']) ? (string)$_GET['action'] : '';
if ($actionEarly === 'register_device' && hash_equals(SYNC_TOKEN, $token)) {
    $body = json_decode((string)file_get_contents('php://input'), true) ?: [];
    $deviceId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($body['deviceId'] ?? ''));
    if ($deviceId === '') { http_response_code(400); echo json_encode(['error'=>'bad device']); exit; }
    $rawToken = bin2hex(random_bytes(32));
    $tokens[$deviceId] = ['hash'=>hash('sha256',$rawToken),'name'=>mb_substr((string)($body['name'] ?? 'دستگاه'),0,80),'createdAt'=>time(),'expiresAt'=>strtotime('+90 days'),'revoked'=>false];
    file_put_contents($tokenFile, json_encode($tokens, JSON_UNESCAPED_UNICODE), LOCK_EX);
    echo json_encode(['ok'=>true,'token'=>$rawToken,'expiresAt'=>$tokens[$deviceId]['expiresAt']]); exit;
}
$authorized = hash_equals(SYNC_TOKEN, $token);
if (!$authorized && $token !== '') foreach ($tokens as $row) { if (empty($row['revoked']) && ($row['expiresAt'] ?? 0) > time() && hash_equals((string)$row['hash'], hash('sha256',$token))) { $authorized=true; break; } }
if (!$authorized) { http_response_code(401); echo json_encode(['error'=>'invalid or expired device token']); exit; }

if (!is_dir(BACKUP_DIR)) { @mkdir(BACKUP_DIR, 0755, true); }

function backup_current_file($key, $file) {
    if (!is_file($file)) return;
    $dayDir = BACKUP_DIR . '/' . date('Y-m-d');
    if (!is_dir($dayDir)) @mkdir($dayDir, 0755, true);
    $backup = $dayDir . '/' . $key . '.json';
    if (!is_file($backup)) @copy($file, $backup);
    // نگهداری ۳۰ روز آخر
    foreach (glob(BACKUP_DIR . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
        if (basename($dir) < date('Y-m-d', strtotime('-30 days'))) {
            foreach (glob($dir . '/*') ?: [] as $old) @unlink($old);
            @rmdir($dir);
        }
    }
}

function create_daily_full_backup() {
    $dayDir = BACKUP_DIR . '/' . date('Y-m-d');
    if (!is_dir($dayDir)) @mkdir($dayDir, 0755, true);
    $count = 0;
    foreach (glob(DATA_DIR . '/*.json') ?: [] as $file) {
        $target = $dayDir . '/' . basename($file);
        // نسخه همان روز تازه می‌شود تا آخرین تغییرات آفلاین رسیده نیز محفوظ باشد.
        if (@copy($file, $target)) $count++;
    }
    return $count;
}

function file_for($key) {
    if (!is_string($key) || !preg_match('/^[A-Za-z0-9_\-]{1,120}$/', $key)) return null;
    return DATA_DIR . '/' . $key . '.json';
}

$method = $_SERVER['REQUEST_METHOD'];

// --- خواندن ---
if ($method === 'GET') {
    $key = isset($_GET['key']) ? (string)$_GET['key'] : '';
    $prefix = isset($_GET['prefix']) ? (string)$_GET['prefix'] : '';
    $action = isset($_GET['action']) ? (string)$_GET['action'] : '';
    if ($action === 'health') {
        $devices = [];
        foreach (glob(DATA_DIR . '/tlift_device_heartbeat_*.json') ?: [] as $df) {
            $row = json_decode((string)file_get_contents($df), true);
            if (is_array($row) && isset($row['data'])) $devices[] = $row['data'];
        }
        usort($devices, function($a,$b){ return ($b['lastSeen'] ?? 0) <=> ($a['lastSeen'] ?? 0); });
        $dates = [];
        foreach (glob(BACKUP_DIR . '/*', GLOB_ONLYDIR) ?: [] as $dir) $dates[] = basename($dir);
        rsort($dates);
        echo json_encode(['ok'=>true,'serverTime'=>date('c'),'writable'=>is_writable(DATA_DIR),'records'=>count(glob(DATA_DIR.'/*.json') ?: []),'diskFree'=>@disk_free_space(DATA_DIR),'diskTotal'=>@disk_total_space(DATA_DIR),'backupCount'=>count($dates),'latestBackup'=>$dates[0] ?? null,'devices'=>$devices], JSON_UNESCAPED_UNICODE); exit;
    }
    if ($action === 'create_backup') {
        $count = create_daily_full_backup();
        echo json_encode(['ok' => true, 'date' => date('Y-m-d'), 'files' => $count]); exit;
    }
    if ($action === 'backups') {
        $dates = [];
        foreach (glob(BACKUP_DIR . '/*', GLOB_ONLYDIR) ?: [] as $dir) $dates[] = basename($dir);
        rsort($dates); echo json_encode($dates); exit;
    }
    if ($action === 'backup' && $key !== '' && isset($_GET['date'])) {
        $date = (string)$_GET['date'];
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { http_response_code(400); echo json_encode(['error'=>'bad date']); exit; }
        $bf = BACKUP_DIR . '/' . $date . '/' . basename($key) . '.json';
        if (is_file($bf)) readfile($bf); else { http_response_code(404); echo json_encode(['error'=>'backup not found']); }
        exit;
    }

    if ($key !== '') {
        $f = file_for($key);
        if ($f && is_file($f)) {
            readfile($f);
        } else {
            echo json_encode(['key' => $key, 'data' => null, 'updated_at' => null, 'exists' => false]);
        }
        exit;
    }

    $rows = [];
    foreach (glob(DATA_DIR . '/*.json') ?: [] as $f) {
        $k = basename($f, '.json');
        if ($prefix !== '' && strpos($k, $prefix) !== 0) continue;
        $c = json_decode((string)file_get_contents($f), true);
        if (is_array($c)) $rows[] = $c;
    }
    echo json_encode($rows);
    exit;
}

// --- نوشتن ---
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        http_response_code(413);
        echo json_encode(['error' => 'payload too large']);
        exit;
    }
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['key'])) {
        http_response_code(400);
        echo json_encode(['error' => 'bad request']);
        exit;
    }
    $f = file_for($body['key']);
    if (!$f) {
        http_response_code(400);
        echo json_encode(['error' => 'bad key']);
        exit;
    }

    // کنترل همزمانی: دستگاه قدیمی اجازه ندارد داده جدیدتر سرور را بی‌صدا بازنویسی کند.
    if (is_file($f) && !empty($body['base_updated_at'])) {
        $current = json_decode((string)file_get_contents($f), true);
        $serverUpdated = is_array($current) ? ($current['updated_at'] ?? '') : '';
        if ($serverUpdated !== '' && strcmp($serverUpdated, (string)$body['base_updated_at']) > 0) {
            http_response_code(409);
            echo json_encode(['error' => 'conflict', 'server' => $current], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    backup_current_file($body['key'], $f);

    $payload = json_encode([
        'key' => $body['key'],
        'data' => isset($body['data']) ? $body['data'] : null,
        'updated_at' => isset($body['updated_at']) ? $body['updated_at'] : date('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // نوشتن اتمی با قفل فایل تا داده‌ها در درخواست‌های همزمان خراب نشوند
    $fp = fopen($f, 'c');
    if ($fp === false) {
        http_response_code(500);
        echo json_encode(['error' => 'cannot write data directory']);
        exit;
    }
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        fwrite($fp, $payload);
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    echo json_encode(['ok' => true, 'key' => $body['key']]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);
