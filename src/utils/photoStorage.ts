import { pushKey } from "../cloudSync";
import { getDeviceToken } from "./deviceAuth";
const PROD = "https://emami-asemansara.ir";
const endpoints = () => location.hostname === "emami-asemansara.ir" || location.hostname === "www.emami-asemansara.ir" ? ["/api/photos.php"] : [`${PROD}/api/photos.php`];
export async function storePhoto(dataUrl: string): Promise<{ value: string; remote: boolean }> {
  if (!dataUrl.startsWith("data:image/")) return { value: dataUrl, remote: true };
  if (!navigator.onLine) return { value: dataUrl, remote: false };
  for (const endpoint of endpoints()) {
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await getDeviceToken()}` }, body: JSON.stringify({ data: dataUrl }) });
      if (!response.ok) continue;
      const result = await response.json();
      if (typeof result.url === "string") return { value: result.url.startsWith("http") ? result.url : `${PROD}${result.url}`, remote: true };
    } catch { /* داده محلی محفوظ می‌ماند و بعداً قابل انتقال است */ }
  }
  return { value: dataUrl, remote: false };
}
export const isInlinePhoto = (value: string) => value.startsWith("data:image/");

export async function migrateInlinePhotos(maxPerRun = 8) {
  if (!navigator.onLine) return 0;
  let migrated = 0;
  const contracts = JSON.parse(localStorage.getItem("tlift_contracts") || "[]");
  for (const contract of contracts) {
    if (!Array.isArray(contract.photos)) continue;
    for (let i = 0; i < contract.photos.length && migrated < maxPerRun; i++) {
      if (!isInlinePhoto(contract.photos[i])) continue;
      const result = await storePhoto(contract.photos[i]);
      if (result.remote) { contract.photos[i] = result.value; migrated++; }
    }
  }
  const details = JSON.parse(localStorage.getItem("tlift_contract_details") || "{}");
  for (const detail of Object.values(details) as any[]) {
    for (const month of detail?.months || []) {
      if (!Array.isArray(month.attachments)) continue;
      for (let i = 0; i < month.attachments.length && migrated < maxPerRun; i++) {
        if (!isInlinePhoto(month.attachments[i])) continue;
        const result = await storePhoto(month.attachments[i]);
        if (result.remote) { month.attachments[i] = result.value; migrated++; }
      }
    }
  }
  if (migrated) {
    localStorage.setItem("tlift_contracts", JSON.stringify(contracts));
    localStorage.setItem("tlift_contract_details", JSON.stringify(details));
    pushKey("tlift_contracts", contracts);
    pushKey("tlift_contract_details", details);
  }
  return migrated;
}
