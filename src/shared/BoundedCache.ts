/** Bounded LRU/TTL cache: no timers and no retained expired value after access. */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { value: V; expires: number }>();
  constructor(
    private readonly capacity: number,
    private readonly ttl: number,
    private readonly clock = Date.now,
  ) {
    if (capacity < 1 || ttl <= 0) throw Error("Invalid cache bounds");
  }
  get size() {
    return this.entries.size;
  }
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expires <= this.clock()) {
      this.entries.delete(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: K, value: V) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.clock() + this.ttl });
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
  }
  delete(key: K) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
}
