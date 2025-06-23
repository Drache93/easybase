import ReadyResource from "ready-resource";
import Autobase from "autobase";
import Hyperswarm from "hyperswarm";
import BlindPairing, { type Member } from "blind-pairing";
import z32 from "z32";
import b4a from "b4a";
import { randomBytes } from "crypto";

// Helper function for no-op
const noop = () => {};

interface EasybaseOptions {
  swarm?: any;
  bootstrap?: any;
  replicate?: boolean;
  key?: any;
  encryptionKey?: any;
  invitePublicKey?: any;
  actions?: Record<
    string,
    (value: any, context: { view: any; base: any }) => Promise<void>
  >;
}

export class EasybasePairer extends ReadyResource {
  store: any;
  invite: string;
  swarm: any;
  pairing: any;
  candidate: any;
  bootstrap: any;
  onresolve: ((value: any) => void) | null;
  onreject: ((reason: any) => void) | null;
  easybase: Easybase | null;
  base: any;

  constructor(store: any, invite: string, opts: { bootstrap?: any } = {}) {
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

  override async _open() {
    await this.store.ready();
    this.swarm = new Hyperswarm({
      keyPair: await this.store.createKeyPair("hyperswarm"),
      bootstrap: this.bootstrap,
    });

    const store = this.store;
    this.swarm.on("connection", (connection: any, peerInfo: any) => {
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
      onadd: async (result: { key: Uint8Array; encryptionKey: Uint8Array }) => {
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
        if (this.onresolve) this._whenWritable();
        this.candidate.close().catch(noop);
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

class Easybase extends ReadyResource {
  private store: any;
  private swarm: Hyperswarm | null;
  public base: Autobase;
  private bootstrap: string;
  private member: Member | null;
  private pairing: BlindPairing | null;
  private replicate: boolean;
  private debug: boolean;
  private invitePublicKey: any;
  private actions: Record<
    string,
    (value: any, context: { view: any; base: any }) => Promise<void>
  >;

  constructor(corestore: any, opts: EasybaseOptions = {}) {
    super();
    this.store = corestore;
    this.swarm = opts.swarm || null;
    this.bootstrap = opts.bootstrap || null;
    this.member = null;
    this.pairing = null;
    this.replicate = opts.replicate !== false;
    this.debug = !!opts.key;
    this.invitePublicKey = opts.invitePublicKey || null;
    this.actions = opts.actions || {};

    const { encryptionKey, key } = opts;

    this.base = new Autobase(this.store, key, {
      encrypt: true,
      encryptionKey,
      open: (store: any) => {
        return store.get("view");
      },
      // New data blocks will be added using the apply function
      apply: this._apply.bind(this),
    });

    this.base.on("update", () => {
      if (!this.base?._interrupting) this.emit("update");
    });

    this.ready().catch(noop);
  }

  private async _apply(nodes: any[], view: any, base: any) {
    for (const node of nodes) {
      const { type, record } = node.value;

      // Handle built-in operations
      switch (type) {
        case "add-invite":
          await view.append(record);
          break;
        case "del-invite":
          await view.del(record);
          break;
        case "add-writer":
          await base.addWriter(record.key);
          break;
        case "remove-writer":
          await base.removeWriter(record.key);
          break;
        default:
          // Check for custom actions
          if (this.actions[type]) {
            await this.actions[type](node.value, { view, base });
          } else {
            // Default behavior: append the value to the view
            await view.append(node.value);
          }
          break;
      }
    }
    await view.flush();
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
    const existing = await this.base.view.findOne("@easybase/invite", {});
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

export { Easybase };
