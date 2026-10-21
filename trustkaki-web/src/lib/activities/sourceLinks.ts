// Shared by the deterministic catalogue and plain-text UI. No HTML is trusted.
export function isOfficialActivitySource(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
    if (url.hostname === "www.onepa.gov.sg") return /^\/events(?:\/[a-z0-9-]+)?\/?$/i.test(url.pathname);
    if (url.hostname === "www.carecorner.org.sg") return url.pathname === "/services/active-ageing/";
    return url.hostname === "www.aic.sg" && url.pathname === "/Care-Services/Active-Ageing-Centres";
  } catch { return false; }
}
