import ReadyResource from "ready-resource";
import Autobase from "autobase";
import Hyperswarm from "hyperswarm";
import BlindPairing, { type Candidate, type Member } from "blind-pairing";
import * as z32 from "z32";
import * as b4a from "b4a";
import { randomBytes } from "crypto";
import Hyperdrive from "hyperdrive";
import Hyperbee from "hyperbee";
import Hyperblobs from "hyperblobs";
import type Corestore from "corestore";
import type { Core } from "corestore";

// Helper function for no-op
const noop = () => {};

type EasybaseOptions = EasybaseOptionsDefault | EasybaseOptionsHyperdrive;

interface EasybaseOptionsBase {
  swarm?: any;
  bootstrap?: any;
  replicate?: boolean;
  key?: any;
  encryptionKey?: any;
  invitePublicKey?: any;
  viewType?: "default" | "hyperdrive";
  actions?: Record<
    string,
    (value: any, context: { view: any; base: Autobase }) => Promise<void>
  >;
}

interface EasybaseOptionsDefault extends EasybaseOptionsBase {
  viewType: "default";
  actions?: Record<
    string,
    (value: any, context: { view: Core; base: Autobase }) => Promise<void>
  >;
}

interface EasybaseOptionsHyperdrive extends EasybaseOptionsBase {
  viewType: "hyperdrive";
  actions?: Record<
    string,
    (value: any, context: { view: Hyperdrive; base: Autobase }) => Promise<void>
  >;
}

export class EasybasePairer extends ReadyResource {
  store: Corestore | null;
  invite: string;
  swarm: Hyperswarm | null;
  pairing: BlindPairing | null;
  candidate: Candidate | null;
  bootstrap: string | null;
  onresolve: ((value: Easybase) => void) | null;
  onreject: ((reason: Error) => void) | null;
  easybase: Easybase | null;
  base: Autobase | null;
  viewType: "default" | "hyperdrive";

  constructor(
    store: Corestore,
    invite: string,
    opts: { bootstrap?: string; viewType?: "default" | "hyperdrive" } = {}
  ) {
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
    this.viewType = opts.viewType || "default";

    this.ready().catch(noop);
  }

  override async _open() {
    await this.store!.ready();
    this.swarm = new Hyperswarm({
      keyPair: await this.store!.createKeyPair("hyperswarm"),
      bootstrap: this.bootstrap,
    });

    const store = this.store;
    this.swarm.on("connection", (connection: any, peerInfo: any) => {
      store!.replicate(connection);
    });

    this.pairing = new BlindPairing(this.swarm);
    const core = Autobase.getLocalCore(this.store!);
    await core.ready();
    const key = core.key;
    await core.close();
    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.invite),
      userData: key,
      onadd: async (result: { key: Uint8Array; encryptionKey: Uint8Array }) => {
        if (this.easybase === null) {
          this.easybase = new Easybase(this.store!, {
            swarm: this.swarm,
            key: result.key,
            encryptionKey: result.encryptionKey,
            bootstrap: this.bootstrap,
            viewType: this.viewType,
          });
        }
        this.swarm = null;
        this.store = null;
        if (this.onresolve) this._whenWritable();
        this.candidate?.close().catch(noop);
      },
    });
  }

  _whenWritable() {
    if (this.easybase?.base.writable) return;
    const check = () => {
      if (this.easybase?.base.writable) {
        this.easybase.base.off("update", check);
        this.onresolve?.(this.easybase);
      }
    };
    this.easybase?.base.on("update", check);
  }

  override async _close() {
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
    } else if (this.easybase) {
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
  private store: Corestore;
  private swarm: Hyperswarm | null;
  public base: Autobase;
  private bootstrap: string;
  private member: Member | null;
  private pairing: BlindPairing | null;
  private replicate: boolean;
  private debug: boolean;
  private invitePublicKey: any;
  private viewType: "default" | "hyperdrive";
  private actions:
    | EasybaseOptionsDefault["actions"]
    | EasybaseOptionsHyperdrive["actions"];

  constructor(corestore: Corestore, opts: EasybaseOptions) {
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
      if (!this.base?._interrupting) this.emit("update");
    });

    this.ready().catch(noop);
  }

  private _openView(store: Corestore) {
    if (this.viewType === "hyperdrive") {
      return this._createHyperdriveView(store);
    }
    // Default view
    return store.get("view");
  }

  private _createHyperdriveView(store: Corestore) {
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
    (this.base as any).db = db;

    return drive;
  }

  private _isHyperdrive(view: Core | Hyperdrive): view is Hyperdrive {
    return this.viewType === "hyperdrive";
  }

  private async _addInvite(view: Core | Hyperdrive, record: any) {
    if (this._isHyperdrive(view)) {
      const fileName = `invite.json`;
      const buffer = Buffer.from(JSON.stringify(record));
      await view.put(fileName, buffer);
    } else {
      await view.append(record);
    }
  }

  private async _delInvite(view: Core | Hyperdrive, record: any) {
    if (this._isHyperdrive(view)) {
      const fileName = `invite.json`;
      await view.del(fileName);
    } else {
      throw new Error("Cannot delete invite from default view");
    }
  }

  private async _apply(nodes: any[], view: any, base: any) {
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
          if (this.actions?.[type]) {
            await this.actions[type](node.value, { view, base });
          } else {
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

  override async _open() {
    await this.base.ready();
    if (this.replicate) await this._replicate();
  }

  override async _close() {
    if (this.swarm) {
      await this.member?.close();
      await this.pairing?.close();
      await this.swarm.destroy();
    }

    // Handle Hyperdrive closing errors
    if (this.viewType === "hyperdrive" && this.base.view) {
      try {
        await this.base.view.close();
      } catch (error) {
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

  static pair(store: any, invite: string, opts: any) {
    return new EasybasePairer(store, invite, opts);
  }

  async createInvite(opts: any = {}) {
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
      const data = await (this.base.view as Hyperdrive).get("invite.json");
      if (data) {
        existing = JSON.parse(data.toString("utf-8"));
      }
    } else {
      existing = await this.base.view.findOne("@easybase/invite", {});
    }

    if (existing) {
      await this.base.append({ type: "del-invite", record: existing });
    }
  }

  async addWriter(key: any) {
    await this.base.append({
      type: "add-writer",
      record: {
        key: b4a.isBuffer(key) ? key : b4a.from(key),
      },
    });
    return true;
  }

  async removeWriter(key: any) {
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
      return (this.base as any).db;
    }
    return null;
  }

  get hyperblobs() {
    if (this.viewType === "hyperdrive" && this.base.view) {
      return this.base.view.blobs;
    }
    return null;
  }

  private async _replicate() {
    await this.base.ready();
    if (this.swarm === null) {
      this.swarm = new Hyperswarm({
        keyPair: await this.store.createKeyPair("hyperswarm"),
        bootstrap: this.bootstrap,
      });
      this.swarm.on("connection", (connection: any, peerInfo: any) => {
        this.store.replicate(connection);
      });
    }
    this.pairing = new BlindPairing(this.swarm);
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey!,
      onadd: async (candidate: any) => {
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
    this.swarm.join(this.base.discoveryKey!);
  }
}

export type { EasybaseOptions };
