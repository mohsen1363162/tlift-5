<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
define('APP_TOKEN', 'tlift-asemansara-1405');
define('MAX_IMAGE_BYTES', 2 * 1024 * 1024);
$token = $_GET['token'] ?? str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION'] ?? '');
$authorized = hash_equals(APP_TOKEN, (string)$token);
$tokenFile = __DIR__ . '/sync_data/device_tokens.json';
$tokens = is_file($tokenFile) ? (json_decode((string)file_get_contents($tokenFile), true) ?: []) : [];
if (!$authorized && $token !== '') foreach ($tokens as $row) { if (empty($row['revoked']) && ($row['expiresAt'] ?? 0) > time() && hash_equals((string)$row['hash'], hash('sha256',(string)$token))) { $authorized=true; break; } }
if (!$authorized) { http_response_code(401); echo json_encode(['error'=>'unauthorized']); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error'=>'method']); exit; }
$body = json_decode(file_get_contents('php://input'), true) ?: [];
$dataUrl = (string)($body['data'] ?? '');
if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,(.+)$#s', $dataUrl, $m)) { http_response_code(400); echo json_encode(['error'=>'invalid image']); exit; }
$binary = base64_decode($m[2], true);
if ($binary === false || strlen($binary) < 20 || strlen($binary) > MAX_IMAGE_BYTES) { http_response_code(413); echo json_encode(['error'=>'image too large']); exit; }
$finfo = new finfo(FILEINFO_MIME_TYPE); $mime = $finfo->buffer($binary);
$allowed = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
if (!isset($allowed[$mime])) { http_response_code(415); echo json_encode(['error'=>'unsupported image']); exit; }
$folder = dirname(__DIR__) . '/uploads/projects/' . date('Y') . '/' . date('m');
if (!is_dir($folder) && !@mkdir($folder, 0755, true)) { http_response_code(500); echo json_encode(['error'=>'storage unavailable']); exit; }
$name = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
$target = $folder . '/' . $name; $tmp = $target . '.tmp';
if (file_put_contents($tmp, $binary, LOCK_EX) === false || !@rename($tmp, $target)) { @unlink($tmp); http_response_code(500); echo json_encode(['error'=>'write failed']); exit; }
$relative = '/uploads/projects/' . date('Y') . '/' . date('m') . '/' . $name;
echo json_encode(['ok'=>true,'url'=>$relative,'bytes'=>strlen($binary)], JSON_UNESCAPED_SLASHES);
