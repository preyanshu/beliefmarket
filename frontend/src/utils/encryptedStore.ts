/**
 * Encrypted IndexedDB Storage
 *
 * All data stored through this module is AES-GCM encrypted using a key
 * derived from NEXT_PUBLIC_STORAGE_SECRET via PBKDF2. Data is only
 * decrypted in memory when accessed.
 *
 * Stores: agent wallets, agent local data, audit trails, logs.
 */

// ─── Constants ────────────────────────────────────────────────────────

const DB_NAME = "beliefmarket_store";
const DB_VERSION = 2; // Bumped to clear stale data from old contract deployment
const STORE_NAME = "encrypted_data";

// Fixed salt for PBKDF2 key derivation (not secret, just needs to be consistent)
const SALT = new Uint8Array([
  0xbe, 0x11, 0xef, 0xaa, 0x72, 0x6b, 0x65, 0x74,
  0x73, 0x61, 0x6c, 0x74, 0x32, 0x30, 0x32, 0x36,
]);

// ─── Crypto Helpers ──────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.NEXT_PUBLIC_STORAGE_SECRET;
  if (!secret) {
    console.warn("[EncryptedStore] NEXT_PUBLIC_STORAGE_SECRET not set, using fallback");
    return "beliefmarket_default_insecure_key_change_me";
  }
  return secret;
}

let cachedKey: CryptoKey | null = null;

async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const secret = getSecret();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return cachedKey;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  // Store as base64: iv (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded: string): Promise<string> {
  const key = await deriveKey();
  const combined = new Uint8Array(
    atob(encoded)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

// ─── IndexedDB Helpers ───────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      // On version upgrade, delete old store to clear stale data from previous contract
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
        console.log("[EncryptedStore] Cleared old data on DB version upgrade");
      }
      db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Store a value encrypted in IndexedDB.
 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    const json = JSON.stringify(value);
    const encrypted = await encrypt(json);

    console.group(`[EncryptedStore] setItem("${key}")`);
    console.log("Plaintext (what your data looks like):", json.slice(0, 200) + (json.length > 200 ? "..." : ""));
    console.log("Encrypted (what gets stored in IndexedDB):", encrypted.slice(0, 120) + "...");
    console.log("Plaintext length:", json.length, "→ Encrypted length:", encrypted.length);
    console.groupEnd();

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, data: encrypted });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.error(`[EncryptedStore] setItem(${key}) failed:`, err);
  }
}

/**
 * Retrieve and decrypt a value from IndexedDB.
 */
export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();

    const encrypted: string | null = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        db.close();
        resolve(request.result?.data ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });

    if (!encrypted) return null;

    console.group(`[EncryptedStore] getItem("${key}")`);
    console.log("Raw from IndexedDB (encrypted):", encrypted.slice(0, 120) + "...");

    const json = await decrypt(encrypted);

    console.log("After decryption (plaintext):", json.slice(0, 200) + (json.length > 200 ? "..." : ""));
    console.groupEnd();
    return JSON.parse(json) as T;
  } catch (err) {
    console.error(`[EncryptedStore] getItem(${key}) failed:`, err);
    return null;
  }
}

/**
 * Remove a key from IndexedDB.
 */
export async function removeItem(key: string): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.error(`[EncryptedStore] removeItem(${key}) failed:`, err);
  }
}

/**
 * List all keys in the store.
 */
export async function getAllKeys(): Promise<string[]> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        db.close();
        resolve(request.result as string[]);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (err) {
    console.error(`[EncryptedStore] getAllKeys failed:`, err);
    return [];
  }
}

// ─── Migration ───────────────────────────────────────────────────────

const MIGRATION_FLAG = "beliefmarket_migrated_to_idb";

/**
 * One-time migration: move all known localStorage keys to encrypted IndexedDB,
 * then remove them from localStorage.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return;

  // Skip if already migrated
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  const keysToMigrate = [
    "beliefmarket_agent_wallets",
    "beliefmarket_agent_local_data",
    "beliefmarket_audit_trail",
  ];

  let migrated = 0;

  for (const key of keysToMigrate) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        await setItem(key, parsed);
        localStorage.removeItem(key);
        migrated++;
        console.log(`[EncryptedStore] Migrated "${key}" to IndexedDB`);
      }
    } catch (err) {
      console.error(`[EncryptedStore] Failed to migrate "${key}":`, err);
    }
  }

  localStorage.setItem(MIGRATION_FLAG, Date.now().toString());
  if (migrated > 0) {
    console.log(`[EncryptedStore] Migration complete. ${migrated} key(s) moved.`);
  }
}
