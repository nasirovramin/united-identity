// Incremental source cursor store for United Identity.
// Telegram keeps only last_seen_id per source. Web keeps a bounded recent fingerprint list.
export class SourceCursorStore {
  constructor(env, { prefix = "source-cursor:", webSeenLimit = 300 } = {}) {
    this.kv = env?.STATE || env?.KV || env?.UNITED_IDENTITY_KV;
    this.prefix = prefix;
    this.webSeenLimit = Math.max(50, Number(webSeenLimit) || 300);
  }
  key(sourceId) { return this.prefix + sourceId; }
  async load(sourceId) {
    if (!this.kv) return {};
    try { return (await this.kv.get(this.key(sourceId), "json")) || {}; } catch { return {}; }
  }
  async save(sourceId, value) {
    if (!this.kv) return;
    await this.kv.put(this.key(sourceId), JSON.stringify(value));
  }
  async telegramLastSeen(sourceId) { return Number((await this.load(sourceId)).last_seen_id || 0); }
  async telegramIsNew(sourceId, messageId) { return Number(messageId) > await this.telegramLastSeen(sourceId); }
  async telegramMarkSeen(sourceId, messageId) {
    const state = await this.load(sourceId);
    state.last_seen_id = Math.max(Number(state.last_seen_id || 0), Number(messageId));
    await this.save(sourceId, state); return state.last_seen_id;
  }
  async fingerprint(url, title = "") {
    const data = new TextEncoder().encode(String(url).trim().toLowerCase()+"\n"+String(title).trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,24);
  }
  async webIsNew(sourceId, url, title = "") {
    const fp = await this.fingerprint(url,title), state = await this.load(sourceId);
    return !(state.recent_seen || []).includes(fp);
  }
  async webMarkSeen(sourceId, url, title = "") {
    const fp = await this.fingerprint(url,title), state = await this.load(sourceId);
    const seen=(state.recent_seen||[]).filter(x=>x!==fp); seen.push(fp);
    state.recent_seen=seen.slice(-this.webSeenLimit); await this.save(sourceId,state); return fp;
  }
}
