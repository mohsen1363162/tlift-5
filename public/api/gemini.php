<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
define('APP_TOKEN', 'tlift-asemansara-1405');
$token = $_GET['token'] ?? str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION'] ?? '');
$authorized = hash_equals(APP_TOKEN, (string)$token);
$tokenFile = __DIR__ . '/sync_data/device_tokens.json';
$tokens = is_file($tokenFile) ? (json_decode((string)file_get_contents($tokenFile), true) ?: []) : [];
if (!$authorized && $token !== '') foreach ($tokens as $row) { if (empty($row['revoked']) && ($row['expiresAt'] ?? 0) > time() && hash_equals((string)$row['hash'], hash('sha256',(string)$token))) { $authorized=true; break; } }
if (!$authorized) { http_response_code(401); echo json_encode(['error'=>'unauthorized']); exit; }
// محدودیت ساده: حداکثر ۳۰ درخواست Gemini در ساعت برای هر توکن
$rateFile = sys_get_temp_dir().'/tlift_gemini_'.hash('sha256',(string)$token).'.json'; $rate=is_file($rateFile)?(json_decode((string)file_get_contents($rateFile),true)?:[]):[]; $rate=array_values(array_filter($rate,function($x){return $x>time()-3600;}));
if(count($rate)>=30){http_response_code(429);echo json_encode(['error'=>'rate_limit']);exit;} $rate[]=time(); file_put_contents($rateFile,json_encode($rate),LOCK_EX);
$body = json_decode(file_get_contents('php://input'), true) ?: [];
$privateDir = __DIR__ . '/private';
$keyFile = $privateDir . '/gemini.key';
if (($body['action'] ?? '') === 'configure') {
  $key = trim((string)($body['apiKey'] ?? ''));
  if (strlen($key) < 20) { http_response_code(400); echo json_encode(['error'=>'invalid key']); exit; }
  if (!is_dir($privateDir)) @mkdir($privateDir, 0700, true);
  file_put_contents($keyFile, $key, LOCK_EX); @chmod($keyFile, 0600);
  echo json_encode(['ok'=>true]); exit;
}
$key = getenv('GEMINI_API_KEY') ?: (is_file($keyFile) ? trim((string)file_get_contents($keyFile)) : '');
if ($key === '') { http_response_code(409); echo json_encode(['error'=>'not_configured']); exit; }
$question = mb_substr(trim((string)($body['question'] ?? '')), 0, 2000);
$context = mb_substr(trim((string)($body['context'] ?? '')), 0, 24000);
$prompt = "شما دستیار مدیریتی تلیفت هستید. فقط بر اساس داده‌های منبع زیر پاسخ فارسی، دقیق و کوتاه بدهید. اگر پاسخ در منابع نیست صریح بگویید. شماره تلفن یا اطلاعات نامرتبط را تکرار نکنید.\n\nپرسش: {$question}\n\nمنابع:\n{$context}";
$payload = json_encode(['contents'=>[['parts'=>[['text'=>$prompt]]]], 'generationConfig'=>['temperature'=>0.2,'maxOutputTokens'=>1200]], JSON_UNESCAPED_UNICODE);
$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . urlencode($key);
$ch = curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>$payload,CURLOPT_TIMEOUT=>30]);
$response = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); $error = curl_error($ch); curl_close($ch);
if ($response === false || $status >= 400) { http_response_code(502); echo json_encode(['error'=>'gemini_failed','detail'=>$error ?: $response]); exit; }
$data = json_decode($response,true); $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
echo json_encode(['ok'=>true,'text'=>$text], JSON_UNESCAPED_UNICODE);
