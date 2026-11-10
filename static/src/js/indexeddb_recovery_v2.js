/** @odoo-module **/

// Recover idb-keyval connections without deleting existing data. Opening without
// a fixed version also permits reopening a database whose schema was repaired.
const Store = window.idbKeyval?.Store;
if (Store) {
    const pending = new Map();
    function openDatabase(name, storeName, version) {
        return new Promise((resolve, reject) => {
            const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                resolve(db);
            };
        });
    }
    async function ensureStore(name, storeName) {
        // A different tab may upgrade between our inspection and our upgrade.
        for (let attempt = 0; attempt < 3; attempt++) {
            const db = await openDatabase(name, storeName);
            if (db.objectStoreNames.contains(storeName)) return db;
            const version = db.version + 1;
            db.close();
            try {
                const upgraded = await openDatabase(name, storeName, version);
                if (upgraded.objectStoreNames.contains(storeName)) return upgraded;
                upgraded.close();
            }
            catch (error) { if (error.name !== "VersionError") throw error; }
        }
        throw new Error("Unable to reopen local storage. Close other Odoo tabs and retry.");
    }
    function recover(name, storeName) {
        const key = JSON.stringify([name, storeName]);
        if (!pending.has(key)) {
            const promise = ensureStore(name, storeName);
            pending.set(key, promise);
            promise.then(() => pending.delete(key), () => pending.delete(key));
        }
        return pending.get(key);
    }
    async function withStore(type, callback) {
        let db = await this._dbp;
        let transaction;
        try {
            transaction = db.transaction(this.storeName, type);
        } catch (error) {
            if (!["InvalidStateError", "NotFoundError"].includes(error.name)) throw error;
            db.close();
            this._dbp = recover(db.name, this.storeName);
            db = await this._dbp;
            transaction = db.transaction(this.storeName, type);
        }
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error);
            try { callback(transaction.objectStore(this.storeName)); }
            catch (error) { transaction.abort(); reject(error); }
        });
    }
    // Existing instances (including the library's default store) and new stores.
    Store.prototype._withIDBStore = withStore;
    window.idbKeyval.Store = class {
        constructor(dbName = "keyval-store", storeName = "keyval") {
            this.storeName = storeName;
            this._dbp = recover(dbName, storeName);
        }
        _withIDBStore(type, callback) { return withStore.call(this, type, callback); }
    };
    let defaultStore;
    for (const [method, index] of [["get", 1], ["set", 2], ["del", 1], ["clear", 0], ["keys", 0]]) {
        const original = window.idbKeyval[method];
        if (!original) continue;
        window.idbKeyval[method] = (...args) => {
            if (args[index] === undefined) {
                defaultStore ||= new window.idbKeyval.Store();
                args[index] = defaultStore;
            }
            return original(...args);
        };
    }
}
