const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../static/src/js/indexeddb_recovery_v2.js'), 'utf8');
function harness(errorName) {
    let opens = 0, operations = 0;
    class Store {}
    const tx = { objectStore: () => ({}), abort() {} };
    const fresh = {objectStoreNames: {contains: () => true}, transaction: () => tx};
    const old = {close() {}, name: 'test', version: 1, transaction() { throw Object.assign(new Error('closed'), {name: errorName}); }};
    const indexedDB = {open() { opens++; const request = {result: fresh}; queueMicrotask(() => request.onsuccess()); return request; }};
    vm.runInNewContext(source, {window: {idbKeyval: {Store}}, indexedDB});
    const store = new Store(); store.storeName = 'keyval'; store._dbp = Promise.resolve(old);
    const callback = () => { operations++; queueMicrotask(() => tx.oncomplete()); };
    return {store, callback, opens: () => opens, operations: () => operations};
}
test('closed connection reopens and executes the operation once', async () => {
    const h = harness('InvalidStateError');
    await h.store._withIDBStore('readwrite', h.callback);
    assert.equal(h.opens(), 1); assert.equal(h.operations(), 1);
    await h.store._withIDBStore('readonly', h.callback);
    assert.equal(h.opens(), 1); assert.equal(h.operations(), 2);
});
test('other database failures propagate without retrying writes', async () => {
    const h = harness('QuotaExceededError');
    await assert.rejects(h.store._withIDBStore('readwrite', h.callback), {name: 'QuotaExceededError'});
    assert.equal(h.opens(), 0); assert.equal(h.operations(), 0);
});


test('missing store is created by upgrade without removing existing stores', async () => {
    class Store {}
    const names = new Set(['existing']);
    const existing = { preserved: 'value' };
    const versions = [];
    const db = {name: 'test', version: 1, close() {}, objectStoreNames: {contains: name => names.has(name)},
        createObjectStore(name) { names.add(name); },
        transaction(name) {
            if (!names.has(name)) throw Object.assign(new Error('missing'), {name: 'NotFoundError'});
            const tx = {objectStore: () => existing};
            queueMicrotask(() => tx.oncomplete());
            return tx;
        }};
    const indexedDB = {open(name, version) {
        versions.push(version);
        const request = {result: db};
        queueMicrotask(() => {
            if (version && version > db.version) { db.version = version; request.onupgradeneeded(); }
            request.onsuccess();
        });
        return request;
    }};
    const library = {Store};
    vm.runInNewContext(source, {window: {idbKeyval: library}, indexedDB});
    const old = new Store(); old.storeName = 'missing'; old._dbp = Promise.resolve(db);
    let operations = 0;
    await old._withIDBStore('readwrite', () => { operations++; });
    assert.equal(operations, 1);
    assert.ok(names.has('existing') && names.has('missing'));
    assert.equal(existing.preserved, 'value');
    assert.deepEqual(versions, [undefined, 2]);
    const reopened = new library.Store('test', 'missing');
    await reopened._withIDBStore('readonly', () => { operations++; });
    assert.equal(versions.at(-1), undefined);
    assert.equal(operations, 2);
});
