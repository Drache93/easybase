import ReadyResource from "ready-resource";
import Autobase from "autobase";
import Hyperswarm from "hyperswarm";
import BlindPairing from "blind-pairing";
import * as z32 from "z32";
import * as b4a from "b4a";
import { randomBytes } from "crypto";
import Hyperdrive from "hyperdrive";
import Hyperbee from "hyperbee";
import Hyperblobs from "hyperblobs";
// Helper function for no-op
const noop = () => { };
export class EasybasePairer extends ReadyResource {
    store;
    invite;
    swarm;
    pairing;
    candidate;
    bootstrap;
    onresolve;
    onreject;
    easybase;
    base;
    constructor(store, invite, opts = {}) {
        super();
        this.store = store;
        this.invite = invite;
        this.swarm = null;
        this.pairing = null;
        this.candidate = null;
        this.bootstrap = opts.bootstrap || null;
        this.onresolve = null;
        this.onreject = null;
        this.easybase = null;
        this.base = null;
        this.ready().catch(noop);
    }
    async _open() {
        await this.store.ready();
        this.swarm = new Hyperswarm({
            keyPair: await this.store.createKeyPair("hyperswarm"),
            bootstrap: this.bootstrap,
        });
        const store = this.store;
        this.swarm.on("connection", (connection, peerInfo) => {
            store.replicate(connection);
        });
        this.pairing = new BlindPairing(this.swarm);
        const core = Autobase.getLocalCore(this.store);
        await core.ready();
        const key = core.key;
        await core.close();
        this.candidate = this.pairing.addCandidate({
            invite: z32.decode(this.invite),
            userData: key,
            onadd: async (result) => {
                if (this.easybase === null) {
                    this.easybase = new Easybase(this.store, {
                        swarm: this.swarm,
                        key: result.key,
                        encryptionKey: result.encryptionKey,
                        bootstrap: this.bootstrap,
                    });
                }
                this.swarm = null;
                this.store = null;
                if (this.onresolve)
                    this._whenWritable();
                this.candidate.close().catch(noop);
            },
        });
    }
    _whenWritable() {
        if (this.easybase?.base.writable)
            return;
        const check = () => {
            if (this.easybase?.base.writable) {
                this.easybase.base.off("update", check);
                this.onresolve?.(this.easybase);
            }
        };
        this.easybase?.base.on("update", check);
    }
    async _close() {
        if (this.candidate !== null) {
            await this.candidate.close();
        }
        if (this.swarm !== null) {
            await this.swarm.destroy();
        }
        if (this.store !== null) {
            await this.store.close();
        }
        if (this.onreject) {
            this.onreject(new Error("Pairing closed"));
        }
        else if (this.easybase) {
            await this.easybase.close();
        }
    }
    finished() {
        return new Promise((resolve, reject) => {
            this.onresolve = resolve;
            this.onreject = reject;
        });
    }
}
export class Easybase extends ReadyResource {
    store;
    swarm;
    base;
    bootstrap;
    member;
    pairing;
    replicate;
    debug;
    invitePublicKey;
    viewType;
    actions;
    constructor(corestore, opts = {}) {
        super();
        this.store = corestore;
        this.swarm = opts.swarm || null;
        this.bootstrap = opts.bootstrap || null;
        this.member = null;
        this.pairing = null;
        this.replicate = opts.replicate !== false;
        this.debug = !!opts.key;
        this.invitePublicKey = opts.invitePublicKey || null;
        this.viewType = opts.viewType || "default";
        this.actions = opts.actions || {};
        const { encryptionKey, key } = opts;
        this.base = new Autobase(this.store, key, {
            encrypt: true,
            encryptionKey,
            open: this._openView.bind(this),
            // New data blocks will be added using the apply function
            apply: this._apply.bind(this),
        });
        this.base.on("update", () => {
            if (!this.base?._interrupting)
                this.emit("update");
        });
        this.ready().catch(noop);
    }
    _openView(store) {
        if (this.viewType === "hyperdrive") {
            return this._createHyperdriveView(store);
        }
        // Default view
        return store.get("view");
    }
    _createHyperdriveView(store) {
        // Create underlying hypercore data structures without hyperdrive to work
        // around readying immediately
        const db = new Hyperbee(store.get("db"), {
            keyEncoding: "utf-8",
            valueEncoding: "json",
            metadata: { contentFeed: null },
            extension: false,
        });
        // Name for blobs doesn't need to be derived from the hyperbee key since
        // there is a unique namespace for the viewstore
        const blobs = new Hyperblobs(store.get("blobs"));
        const drive = new Hyperdrive(store, { _db: db });
        // @ts-ignore
        drive.blobs = blobs;
        // Store the db reference on the base for access in apply function
        this.base.db = db;
        return drive;
    }
    async _addInvite(view, record) {
        if (this.viewType === "hyperdrive") {
            const fileName = `invite.json`;
            await view.put(fileName, JSON.stringify(record));
        }
        else {
            await view.append(record);
        }
    }
    async _delInvite(view, record) {
        if (this.viewType === "hyperdrive") {
            const fileName = `invite.json`;
            await view.del(fileName);
        }
        else {
            await view.del(record);
        }
    }
    async _apply(nodes, view, base) {
        for (const node of nodes) {
            const { type, record } = node.value;
            // Handle built-in operations
            switch (type) {
                case "add-invite":
                    await this._addInvite(view, record);
                    break;
                case "del-invite":
                    await this._delInvite(view, record);
                    break;
                case "add-writer":
                    await base.addWriter(Buffer.from(record.key, "hex"));
                    break;
                case "remove-writer":
                    await base.removeWriter(Buffer.from(record.key, "hex"));
                    break;
                default:
                    if (this.viewType === "hyperdrive" && record?.blob) {
                        // Check if the file already exists
                        const existingFile = await view.get(record.filename);
                        if (existingFile) {
                            console.log("file already exists", record.filename);
                            continue;
                        }
                        await view.put(record.filename, record.blob);
                        continue;
                    }
                    // Check for custom actions
                    if (this.actions[type]) {
                        await this.actions[type](node.value, { view, base });
                    }
                    else {
                        // Default behavior: append the value to the view
                        await view.append(node.value);
                    }
                    break;
            }
        }
        // Flush the view if it has a flush method
        if (view.flush) {
            await view.flush();
        }
    }
    async _open() {
        await this.base.ready();
        if (this.replicate)
            await this._replicate();
    }
    async _close() {
        if (this.swarm) {
            await this.member?.close();
            await this.pairing?.close();
            await this.swarm.destroy();
        }
        // Handle Hyperdrive closing errors
        if (this.viewType === "hyperdrive" && this.base.view) {
            try {
                await this.base.view.close();
            }
            catch (error) {
                console.log("Error closing Hyperdrive view:", error);
            }
        }
        await this.base.close();
    }
    get writerKey() {
        return this.base.local.key;
    }
    get key() {
        return this.base.key;
    }
    get discoveryKey() {
        return this.base.discoveryKey;
    }
    get encryptionKey() {
        return this.base.encryptionKey;
    }
    static pair(store, invite, opts) {
        return new EasybasePairer(store, invite, opts);
    }
    async createInvite(opts = {}) {
        await this.ready();
        const existing = await this.base.view.findOne("@easybase/invite", {});
        if (existing) {
            return z32.encode(existing.invite);
        }
        // Create a simple invite since BlindPairing.createInvite is not available
        const inviteData = {
            id: randomBytes(32),
            invite: randomBytes(32),
            publicKey: randomBytes(32),
            expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        };
        const record = inviteData;
        await this.base.append({ type: "add-invite", record });
        return z32.encode(record.invite);
    }
    async deleteInvite() {
        await this.ready();
        let existing;
        if (this.viewType === "hyperdrive") {
            const data = await this.base.view.get("invite.json");
            if (data) {
                existing = JSON.parse(data.toString("utf-8"));
            }
        }
        else {
            existing = await this.base.view.findOne("@easybase/invite", {});
        }
        if (existing) {
            await this.base.append({ type: "del-invite", record: existing });
        }
    }
    async addWriter(key) {
        await this.base.append({
            type: "add-writer",
            record: {
                key: b4a.isBuffer(key) ? key : b4a.from(key),
            },
        });
        return true;
    }
    async removeWriter(key) {
        await this.base.append({
            type: "remove-writer",
            record: {
                key: b4a.isBuffer(key) ? key : b4a.from(key),
            },
        });
    }
    get writable() {
        return this.base.writable;
    }
    // Helper methods for Hyperdrive view
    get hyperdriveView() {
        if (this.viewType === "hyperdrive") {
            return this.base.view;
        }
        return null;
    }
    get hyperbeeDb() {
        if (this.viewType === "hyperdrive") {
            return this.base.db;
        }
        return null;
    }
    get hyperblobs() {
        if (this.viewType === "hyperdrive" && this.base.view) {
            return this.base.view.blobs;
        }
        return null;
    }
    async _replicate() {
        await this.base.ready();
        if (this.swarm === null) {
            this.swarm = new Hyperswarm({
                keyPair: await this.store.createKeyPair("hyperswarm"),
                bootstrap: this.bootstrap,
            });
            this.swarm.on("connection", (connection, peerInfo) => {
                this.store.replicate(connection);
            });
        }
        this.pairing = new BlindPairing(this.swarm);
        this.member = this.pairing.addMember({
            discoveryKey: this.base.discoveryKey,
            onadd: async (candidate) => {
                const id = candidate.inviteId;
                // Fix the undefined 'inv' variable
                candidate.open(candidate.publicKey);
                await this.addWriter(candidate.userData);
                candidate.confirm({
                    key: this.base.key,
                    encryptionKey: this.base.encryptionKey,
                });
            },
        });
        this.swarm.join(this.base.discoveryKey);
    }
}
//# sourceMappingURL=index.js.map