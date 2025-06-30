import ReadyResource from "ready-resource";
import Autobase from "autobase";
import Hyperswarm from "hyperswarm";
import BlindPairing, { type Candidate, type Member } from "blind-pairing";
import * as z32 from "z32";
import Hyperdrive from "hyperdrive";
import Hyperbee from "hyperbee";
import Hyperblobs from "hyperblobs";
import type Corestore from "corestore";
import * as b4a from "b4a";

// Helper function for no-op
const noop = () => {};

// Debug utility function
function debugLog(debug: boolean, prefix: string, message: string, data?: any) {
  if (debug) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${prefix}] ${message}`;
    if (data !== undefined) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }
}

// Custom error types
export class EasybaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "EasybaseError";
  }
}

export class EasybasePairingError extends EasybaseError {
  constructor(message: string) {
    super(message, "PAIRING_ERROR");
    this.name = "EasybasePairingError";
  }
}

// Type for action function signature
type ActionFunction<TView> = (
  value: any,
  context: { view: TView; base: Autobase }
) => Promise<void>;

// Type for creating action methods from action keys
type ActionMethods<TActions> = {
  [K in keyof TActions]: TActions[K] extends ActionFunction<any>
    ? (value: Parameters<TActions[K]>[0]) => Promise<void>
    : never;
};

type EasybaseOptions<
  TActions extends Record<string, ActionFunction<any>> = {}
> = EasybaseOptionsDefault<TActions> | EasybaseOptionsHyperdrive<TActions>;

type EasybasePairerOptions<
  TActions extends Record<string, ActionFunction<any>> = {}
> =
  | EasybasePairerOptionsDefault<TActions>
  | EasybasePairerOptionsHyperdrive<TActions>;

type ViewType = "default" | "hyperdrive";

interface EasybaseOptionsBase<
  TActions extends Record<string, ActionFunction<any>> = {}
> {
  bootstrap?: Uint8Array;
  topic?: string;
  viewType?: ViewType;
  actions?: TActions;
  debug?: boolean;
}

interface EasybasePairerBaseOptions {
  viewType?: ViewType;
  topic?: string;
  actions?: Record<string, ActionFunction<any>>;
  debug?: boolean;
}

export interface EasybasePairerOptionsDefault<
  TActions extends Record<string, ActionFunction<Hyperbee>> = {}
> extends EasybasePairerBaseOptions {
  viewType: "default";
  actions: TActions;
}

export interface EasybasePairerOptionsHyperdrive<
  TActions extends Record<string, ActionFunction<Hyperdrive>> = {}
> extends EasybasePairerBaseOptions {
  viewType: "hyperdrive";
  actions: TActions;
}

interface EasybaseOptionsDefault<
  TActions extends Record<string, ActionFunction<Hyperbee>> = {}
> extends EasybaseOptionsBase<TActions> {
  viewType: "default";
  actions?: TActions;
  debug?: boolean;
}

interface EasybaseOptionsHyperdrive<
  TActions extends Record<string, ActionFunction<Hyperdrive>> = {}
> extends EasybaseOptionsBase<TActions> {
  viewType: "hyperdrive";
  actions?: TActions;
  debug?: boolean;
}

interface InviteRecord {
  id: string;
  invite: Buffer;
  publicKey: Buffer;
  expires: number;
}

// Helper for JSON serialization
function inviteRecordToJSON(record: InviteRecord): any {
  return {
    ...record,
    invite: Array.isArray(record.invite)
      ? record.invite.toString("base64")
      : Buffer.from(record.invite).toString("base64"),
    publicKey: Array.isArray(record.publicKey)
      ? record.publicKey.toString("base64")
      : Buffer.from(record.publicKey).toString("base64"),
  };
}
function inviteRecordFromJSON(json: any): InviteRecord {
  return {
    ...json,
    invite: Buffer.from(json.invite, "base64"),
    publicKey: Buffer.from(json.publicKey, "base64"),
  };
}

export class EasybasePairer<
  TActions extends Record<string, ActionFunction<any>> = {},
  TViewType extends ViewType = "default"
> extends ReadyResource {
  private store: Corestore | null;
  private invite: string;
  private swarm: Hyperswarm | null;
  private pairing: BlindPairing | null;
  private candidate: Candidate | null;
  private onresolve: ((value: Easybase<any>) => void) | null;
  private onreject: ((reason: Error) => void) | null;
  private easybase: Easybase<any> | null;
  private viewType: TViewType;
  private updateListener: (() => void) | null = null;
  private topic: Uint8Array | null;
  private debug: boolean;
  private actions: TActions;

  constructor(
    store: Corestore,
    invite: string,
    opts: EasybasePairerOptions<TActions>
  ) {
    super();

    debugLog(opts.debug || false, "EasybasePairer", "Constructor called", {
      invite: invite ? `${invite.substring(0, 10)}...` : "undefined",
      viewType: opts.viewType || "default",
      topic: opts.topic,
      debug: opts.debug || false,
    });

    if (!store) {
      debugLog(
        opts.debug || false,
        "EasybasePairer",
        "ERROR: Corestore is required"
      );
      throw new EasybasePairingError("Corestore is required");
    }
    if (!invite || typeof invite !== "string") {
      debugLog(
        opts.debug || false,
        "EasybasePairer",
        "ERROR: Valid invite string is required"
      );
      throw new EasybasePairingError("Valid invite string is required");
    }

    this.store = store;
    this.invite = invite;
    this.swarm = null;
    this.pairing = null;
    this.candidate = null;
    this.onresolve = null;
    this.onreject = null;
    this.easybase = null;
    this.viewType = (opts.viewType || "default") as TViewType;
    this.topic = opts.topic ? b4a.from(opts.topic, "hex") : null;
    this.debug = opts.debug || false;
    this.actions = opts.actions || {};
    this.ready().catch(noop);
  }

  override async _open() {
    debugLog(this.debug, "EasybasePairer", "_open() called");

    if (!this.store) {
      debugLog(this.debug, "EasybasePairer", "ERROR: Store is not available");
      throw new EasybasePairingError("Store is not available");
    }

    debugLog(this.debug, "EasybasePairer", "Waiting for store to be ready");
    await this.store.ready();
    debugLog(this.debug, "EasybasePairer", "Store is ready");

    debugLog(this.debug, "EasybasePairer", "Creating Hyperswarm");
    this.swarm = new Hyperswarm();

    const store = this.store;
    this.swarm.on("connection", (connection: any, peerInfo: any) => {
      debugLog(this.debug, "EasybasePairer", "Swarm connection established", {
        peerInfo: peerInfo ? { id: peerInfo.id?.toString("hex") } : null,
      });
      store!.replicate(connection);
    });

    debugLog(this.debug, "EasybasePairer", "Creating BlindPairing");
    this.pairing = new BlindPairing(this.swarm);

    debugLog(this.debug, "EasybasePairer", "Getting local core");
    const core = Autobase.getLocalCore(this.store);
    await core.ready();
    const key = core.key;
    await core.close();

    debugLog(this.debug, "EasybasePairer", "Local core key obtained", {
      key: key ? key.toString("hex").substring(0, 16) + "..." : null,
    });

    if (!key) {
      debugLog(
        this.debug,
        "EasybasePairer",
        "ERROR: Failed to get local core key"
      );
      throw new EasybasePairingError("Failed to get local core key");
    }

    debugLog(this.debug, "EasybasePairer", "Adding candidate to pairing");
    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.invite),
      userData: key,
      onadd: async (result: { key: Uint8Array }) => {
        debugLog(this.debug, "EasybasePairer", "onadd callback triggered", {
          resultKey: result.key
            ? Buffer.from(result.key).toString("hex").substring(0, 16) + "..."
            : null,
          resultKeyLength: result.key ? result.key.length : 0,
        });

        if (this.easybase === null) {
          debugLog(
            this.debug,
            "EasybasePairer",
            "Creating new Easybase instance",
            {
              viewType: this.viewType,
              bootstrap: result.key
                ? Buffer.from(result.key).toString("hex").substring(0, 16) +
                  "..."
                : null,
              debug: this.debug,
            }
          );
          this.easybase = new Easybase(this.store!, {
            viewType: this.viewType,
            bootstrap: result.key,
            actions: this.actions,
            debug: this.debug,
          });
        }

        debugLog(
          this.debug,
          "EasybasePairer",
          "Waiting for Easybase to be ready"
        );
        await this.easybase.ready();
        debugLog(this.debug, "EasybasePairer", "Easybase is ready");

        const discoveryKey = this.topic || this.easybase.discoveryKey!;
        debugLog(
          this.debug,
          "EasybasePairer",
          "Joining swarm with discovery key",
          {
            discoveryKey: discoveryKey.toString("hex").substring(0, 16) + "...",
          }
        );

        const discovery = this.swarm?.join(discoveryKey);
        debugLog(this.debug, "EasybasePairer", "Discovery session created");

        // @ts-expect-error DiscoverySession.flushed is not typed
        await discovery!.flushed();
        debugLog(this.debug, "EasybasePairer", "Discovery session flushed");

        if (this.onresolve) {
          debugLog(this.debug, "EasybasePairer", "Calling _whenWritable");
          this._whenWritable();
        }

        debugLog(this.debug, "EasybasePairer", "Closing candidate");
        this.candidate?.close().catch(noop);
      },
    });

    debugLog(this.debug, "EasybasePairer", "_open() completed");
  }

  private _whenWritable() {
    debugLog(this.debug, "EasybasePairer", "_whenWritable() called");

    if (!this.easybase?.base) {
      debugLog(this.debug, "EasybasePairer", "Easybase or base not available");
      return;
    }

    debugLog(this.debug, "EasybasePairer", "Checking if base is writable", {
      writable: this.easybase.base.writable,
      baseLength: this.easybase.base.length,
      baseKey: this.easybase.base.key
        ? this.easybase.base.key.toString("hex").substring(0, 16) + "..."
        : null,
      localKey: this.easybase.base.local.key
        ? this.easybase.base.local.key.toString("hex").substring(0, 16) + "..."
        : null,
    });

    if (this.easybase.base.writable) {
      debugLog(
        this.debug,
        "EasybasePairer",
        "Base is writable, resolving promise"
      );
      this.onresolve?.(this.easybase);
      return;
    }

    // Wait for the base to be ready and process any pending updates
    const waitForReady = async () => {
      debugLog(this.debug, "EasybasePairer", "Waiting for base to be ready");
      await this.easybase!.base.ready();
      debugLog(
        this.debug,
        "EasybasePairer",
        "Base is ready, checking writable status"
      );

      // Force an update to process any pending operations
      await this.easybase!.base.update();
      debugLog(this.debug, "EasybasePairer", "Base update completed", {
        writable: this.easybase!.base.writable,
        baseLength: this.easybase!.base.length,
      });

      if (this.easybase!.base.writable) {
        debugLog(
          this.debug,
          "EasybasePairer",
          "Base became writable after update, resolving promise"
        );
        this._cleanupUpdateListener();
        if (this.easybase) {
          this.onresolve?.(this.easybase);
        }
        return;
      }
    };

    // Try waiting for ready first
    waitForReady().catch((error) => {
      debugLog(this.debug, "EasybasePairer", "Error waiting for base ready", {
        error,
      });
    });

    const check = () => {
      debugLog(this.debug, "EasybasePairer", "Writable check triggered", {
        baseExists: !!this.easybase?.base,
        writable: this.easybase?.base.writable,
        baseLength: this.easybase?.base.length,
      });

      if (this.easybase?.base.writable) {
        debugLog(
          this.debug,
          "EasybasePairer",
          "Base became writable, resolving promise"
        );
        this._cleanupUpdateListener();
        if (this.easybase) {
          this.onresolve?.(this.easybase);
        }
      }
    };

    this.updateListener = check;
    this.easybase.base.on("update", check);
    debugLog(
      this.debug,
      "EasybasePairer",
      "Added update listener for writable check"
    );

    const interval = setInterval(async () => {
      debugLog(this.debug, "EasybasePairer", "Periodic writable check", {
        writable: this.easybase?.base.writable,
        baseExists: !!this.easybase?.base,
        baseLength: this.easybase?.base.length,
      });

      if (this.easybase?.base.writable) {
        debugLog(
          this.debug,
          "EasybasePairer",
          "Base became writable during periodic check"
        );
        clearInterval(interval);
        this._cleanupUpdateListener();
        if (this.easybase) {
          this.onresolve?.(this.easybase);
        }
        return;
      }

      // Try forcing an update periodically
      try {
        await this.easybase?.base.update();
        debugLog(
          this.debug,
          "EasybasePairer",
          "Forced base update during periodic check",
          {
            writable: this.easybase?.base.writable,
            baseLength: this.easybase?.base.length,
          }
        );

        if (this.easybase?.base.writable) {
          debugLog(
            this.debug,
            "EasybasePairer",
            "Base became writable after forced update"
          );
          clearInterval(interval);
          this._cleanupUpdateListener();
          if (this.easybase) {
            this.onresolve?.(this.easybase);
          }
        }
      } catch (error) {
        debugLog(this.debug, "EasybasePairer", "Error during forced update", {
          error,
        });
      }
    }, 1000);
  }

  private _cleanupUpdateListener() {
    debugLog(this.debug, "EasybasePairer", "_cleanupUpdateListener() called");

    if (this.updateListener && this.easybase?.base) {
      debugLog(this.debug, "EasybasePairer", "Removing update listener");
      this.easybase.base.off("update", this.updateListener);
      this.updateListener = null;
    }
  }

  override async _close() {
    debugLog(this.debug, "EasybasePairer", "_close() called");

    this._cleanupUpdateListener();

    if (this.candidate !== null) {
      debugLog(this.debug, "EasybasePairer", "Closing candidate");
      await this.candidate.close();
    }

    if (this.swarm !== null) {
      debugLog(this.debug, "EasybasePairer", "Destroying swarm");
      await this.swarm.destroy();
    }

    if (this.store !== null) {
      debugLog(this.debug, "EasybasePairer", "Closing store");
      await this.store.close();
    }

    if (this.onreject) {
      debugLog(this.debug, "EasybasePairer", "Rejecting promise due to close");
      this.onreject(new EasybasePairingError("Pairing closed"));
    } else if (this.easybase) {
      debugLog(this.debug, "EasybasePairer", "Closing Easybase instance");
      await this.easybase.close();
    }

    debugLog(this.debug, "EasybasePairer", "_close() completed");
  }

  finished(): Promise<Easybase<TActions>> {
    debugLog(this.debug, "EasybasePairer", "finished() called");

    return new Promise((resolve, reject) => {
      debugLog(this.debug, "EasybasePairer", "Creating finished promise");
      this.onresolve = resolve;
      this.onreject = reject;
    });
  }
}

export class Easybase<
  TActions extends Record<string, ActionFunction<any>> = {},
  TViewType extends "default" | "hyperdrive" = "default"
> extends ReadyResource {
  private store: Corestore;
  public base: Autobase;
  public swarm: Hyperswarm;
  private bootstrap: Buffer | null;
  private member: Member | null;
  private pairing: BlindPairing | null;
  private topic: Uint8Array | null;
  private viewType: TViewType;
  private actions: TActions;
  private debug: boolean;
  private replicate = true;

  // Index signature to allow dynamic action methods
  [key: string]: any;

  constructor(corestore: Corestore, opts: EasybaseOptions<TActions>) {
    super();

    debugLog(opts.debug || false, "Easybase", "Constructor called", {
      viewType: opts.viewType || "default",
      topic: opts.topic,
      bootstrap: opts.bootstrap
        ? Buffer.from(opts.bootstrap).toString("hex").substring(0, 16) + "..."
        : null,
      actionsCount: opts.actions ? Object.keys(opts.actions).length : 0,
      debug: opts.debug || false,
    });

    if (!corestore) {
      debugLog(opts.debug || false, "Easybase", "ERROR: Corestore is required");
      throw new EasybaseError("Corestore is required");
    }

    this.store = corestore;
    this.member = null;
    this.pairing = null;
    this.viewType = (opts.viewType || "default") as TViewType;
    this.actions = (opts.actions || {}) as TActions;
    this.topic = opts.topic ? b4a.from(opts.topic, "hex") : null;
    this.bootstrap = opts.bootstrap ? Buffer.from(opts.bootstrap) : null;
    this.debug = opts.debug || false;

    debugLog(this.debug, "Easybase", "Creating Hyperswarm");
    this.swarm = new Hyperswarm();

    debugLog(this.debug, "Easybase", "Creating Autobase");
    debugLog(this.debug, "Easybase", "Bootstrap", {
      bootstrap: this.bootstrap
        ? this.bootstrap.toString("hex").substring(0, 16) + "..."
        : null,
    });
    this.base = new Autobase(this.store, this.bootstrap, {
      open: this._openView.bind(this),
      apply: this._apply.bind(this),
      valueEncoding: "json",
    });

    this.base.on("update", () => {
      debugLog(this.debug, "Easybase", "Base update event", {
        interrupting: this.base?._interrupting,
        baseLength: this.base?.length,
        writable: this.base?.writable,
      });
      if (!this.base?._interrupting) this.emit("update");
    });

    // Create dynamic action methods
    if (this.actions) {
      debugLog(this.debug, "Easybase", "Creating dynamic action methods", {
        actions: Object.keys(this.actions),
      });

      for (const [actionName, actionFn] of Object.entries(this.actions)) {
        this[actionName] = async (value: any) => {
          debugLog(
            this.debug,
            "Easybase",
            `Dynamic action called: ${actionName}`,
            { value }
          );
          await this.base.append({
            type: actionName,
            record: value,
          });
        };
      }
    }

    this.ready().catch(noop);
  }

  static pair(
    store: Corestore,
    invite: string,
    opts: EasybasePairerOptionsDefault | EasybasePairerOptionsHyperdrive
  ): EasybasePairer {
    return new EasybasePairer(store, invite, opts);
  }

  static generateTopic(topic: string) {
    debugLog(false, "Easybase", "generateTopic() called", { topic });

    if (topic.length > 32) {
      debugLog(false, "Easybase", "ERROR: Topic too long", {
        topic,
        length: topic.length,
      });
      throw new EasybaseError("Topic must be less than 32 characters");
    }

    const result = Buffer.alloc(32).fill(topic).toString("hex");
    debugLog(false, "Easybase", "generateTopic() result", { topic, result });
    return result;
  }

  private _openView(store: Corestore): Hyperbee | Hyperdrive {
    debugLog(this.debug, "Easybase", "_openView() called", {
      viewType: this.viewType,
    });

    if (this.viewType === "hyperdrive") {
      debugLog(this.debug, "Easybase", "Creating Hyperdrive view");
      return this._createHyperdriveView(store);
    }

    debugLog(this.debug, "Easybase", "Creating default Hyperbee view");
    return this._createDefaultView(store);
  }

  private _createDefaultView(store: Corestore): Hyperbee {
    debugLog(this.debug, "Easybase", "_createDefaultView() called");

    const view = new Hyperbee(store.get("view"), {
      keyEncoding: "utf-8",
      valueEncoding: "json",
      metadata: { contentFeed: null },
      extension: false,
    });

    debugLog(this.debug, "Easybase", "Default view created");
    return view;
  }

  private _createHyperdriveView(store: Corestore): Hyperdrive {
    debugLog(this.debug, "Easybase", "_createHyperdriveView() called");

    // Create underlying hypercore data structures without hyperdrive to work
    // around readying immediately
    debugLog(this.debug, "Easybase", "Creating Hyperbee for Hyperdrive");
    const db = new Hyperbee(store.get("db"), {
      keyEncoding: "utf-8",
      valueEncoding: "json",
      metadata: { contentFeed: null },
      extension: false,
    });

    // Name for blobs doesn't need to be derived from the hyperbee key since
    // there is a unique namespace for the viewstore
    debugLog(this.debug, "Easybase", "Creating Hyperblobs");
    const blobs = new Hyperblobs(store.get("blobs"));

    debugLog(this.debug, "Easybase", "Creating Hyperdrive");
    const drive = new Hyperdrive(store, { _db: db });

    // Properly type the blobs assignment
    (drive as any).blobs = blobs;

    debugLog(this.debug, "Easybase", "Hyperdrive view created");
    return drive;
  }

  private _isHyperdrive(view: Hyperbee | Hyperdrive): view is Hyperdrive {
    return this.viewType === "hyperdrive";
  }

  private async _addInvite(
    view: Hyperbee | Hyperdrive,
    record: object
  ): Promise<void> {
    debugLog(this.debug, "Easybase", "_addInvite() called", record);

    if (this._isHyperdrive(view)) {
      debugLog(this.debug, "Easybase", "Adding invite to Hyperdrive view");
      const fileName = `invite.json`;
      const buffer = Buffer.from(JSON.stringify(record));
      await view.put(fileName, buffer);
      debugLog(this.debug, "Easybase", "Invite added to Hyperdrive");
    } else {
      debugLog(this.debug, "Easybase", "Adding invite to Hyperbee view");
      await view.put("@easybase/invite", record);
      debugLog(this.debug, "Easybase", "Invite added to Hyperbee");
    }
  }

  private async _delInvite(
    view: Hyperbee | Hyperdrive,
    record: InviteRecord
  ): Promise<void> {
    debugLog(this.debug, "Easybase", "_delInvite() called", {
      viewType: this.viewType,
      recordId: record.id,
    });

    if (this._isHyperdrive(view)) {
      debugLog(this.debug, "Easybase", "Deleting invite from Hyperdrive view");
      const fileName = `invite.json`;
      await view.del(fileName);
      debugLog(this.debug, "Easybase", "Invite deleted from Hyperdrive");
    } else {
      debugLog(
        this.debug,
        "Easybase",
        "ERROR: Cannot delete invite from default view"
      );
      throw new EasybaseError(
        "Cannot delete invite from default view",
        "INVALID_OPERATION"
      );
    }
  }

  private async _apply(
    nodes: any[],
    view: Hyperbee | Hyperdrive,
    base: Autobase
  ): Promise<void> {
    debugLog(this.debug, "Easybase", "_apply() called", {
      nodesCount: nodes.length,
      viewType: this.viewType,
    });

    for (const node of nodes) {
      const { type, record } = node.value;

      debugLog(this.debug, "Easybase", "Processing node", {
        type,
        record,
      });

      // Handle built-in operations
      switch (type) {
        case "add-invite":
          debugLog(this.debug, "Easybase", "Processing add-invite action");
          await this._addInvite(view, record);
          break;
        case "del-invite":
          debugLog(this.debug, "Easybase", "Processing del-invite action");
          await this._delInvite(view, record);
          break;
        case "add-writer":
          debugLog(this.debug, "Easybase", "Processing add-writer action", {
            hasKey: !!record?.key,
          });

          if (!record?.key) {
            debugLog(this.debug, "Easybase", "ERROR: Writer key is required");
            throw new EasybaseError(
              "Writer key is required",
              "INVALID_WRITER_KEY"
            );
          }

          // @ts-expect-error Autobase.addWriter is not typed
          await base.addWriter(Buffer.from(record.key, "hex"), {
            indexer: true,
          });
          debugLog(this.debug, "Easybase", "Writer added successfully");
          break;
        case "remove-writer":
          debugLog(this.debug, "Easybase", "Processing remove-writer action", {
            hasKey: !!record?.key,
          });

          if (!record?.key) {
            debugLog(this.debug, "Easybase", "ERROR: Writer key is required");
            throw new EasybaseError(
              "Writer key is required",
              "INVALID_WRITER_KEY"
            );
          }

          // @ts-expect-error Autobase.removeWriter is not typed
          await base.removeWriter(Buffer.from(record.key, "hex"));
          debugLog(this.debug, "Easybase", "Writer removed successfully");
          break;
        default:
          const useDefault = !this.actions || !type || !(type in this.actions);
          const action = useDefault ? this.actions.default : this.actions[type];

          // Check for custom actions
          if (action) {
            debugLog(this.debug, "Easybase", "Processing action", {
              type,
              useDefault,
            });
            await action(useDefault ? node.value : record, { view, base });
            debugLog(this.debug, "Easybase", "Action completed", {
              type,
              useDefault,
            });
          } else {
            debugLog(this.debug, "Easybase", "ERROR: Unknown action", { type });
            throw new EasybaseError(
              `Unknown action: ${type}`,
              "UNKNOWN_ACTION"
            );
          }
          break;
      }
    }

    debugLog(this.debug, "Easybase", "_apply() completed");
  }

  override async _open() {
    debugLog(this.debug, "Easybase", "_open() called");

    debugLog(this.debug, "Easybase", "Adding swarm connection listener");
    this.swarm.on("connection", (connection: any, peerInfo: any) => {
      debugLog(
        this.debug,
        "Easybase",
        "Swarm connection established during replication",
        {
          peerInfo,
        }
      );
      this.store.replicate(connection);
    });

    debugLog(this.debug, "Easybase", "Waiting for base to be ready");
    await this.base.ready();
    debugLog(this.debug, "Easybase", "Base is ready");

    if (this.replicate) {
      debugLog(this.debug, "Easybase", "Starting replication");
      await this._replicate();
    }

    debugLog(this.debug, "Easybase", "_open() completed");
  }

  override async _close() {
    debugLog(this.debug, "Easybase", "_close() called");

    if (this.swarm) {
      debugLog(this.debug, "Easybase", "Closing member");
      await this.member?.close();

      debugLog(this.debug, "Easybase", "Closing pairing");
      await this.pairing?.close();

      debugLog(this.debug, "Easybase", "Destroying swarm");
      await this.swarm.destroy();
    }

    // Handle Hyperdrive closing errors
    if (this.viewType === "hyperdrive" && this.base.view) {
      debugLog(this.debug, "Easybase", "Closing Hyperdrive view");
      try {
        await this.base.view.close();
        debugLog(this.debug, "Easybase", "Hyperdrive view closed successfully");
      } catch (error) {
        debugLog(
          this.debug,
          "Easybase",
          "Warning: Error closing Hyperdrive view",
          { error }
        );
        // Log error but don't throw - this is expected behavior on first create
        console.warn(
          "Warning: Error closing Hyperdrive view (this may be expected):",
          error
        );
      }
    }

    debugLog(this.debug, "Easybase", "Closing base");
    await this.base.close();

    debugLog(this.debug, "Easybase", "_close() completed");
  }

  get writerKey(): Buffer {
    const key = this.base.local.key!;
    debugLog(this.debug, "Easybase", "writerKey getter called", {
      key: key ? key.toString("hex").substring(0, 16) + "..." : null,
    });
    return key;
  }

  get key(): Buffer {
    const key = this.base.key!;
    debugLog(this.debug, "Easybase", "key getter called", {
      key: key ? key.toString("hex").substring(0, 16) + "..." : null,
    });
    return key;
  }

  get discoveryKey(): Buffer {
    const key = this.base.discoveryKey!;
    debugLog(this.debug, "Easybase", "discoveryKey getter called", {
      key: key ? key.toString("hex").substring(0, 16) + "..." : null,
    });
    return key;
  }

  async getInvite() {
    debugLog(this.debug, "Easybase", "getInvite() called");
    await this.ready();

    let existing: InviteRecord | null = null;

    if (this._isHyperdrive(this.base.view)) {
      debugLog(this.debug, "Easybase", "Getting invite from Hyperdrive view");
      try {
        const data = await this.base.view.get("invite.json");
        if (data) {
          debugLog(this.debug, "Easybase", "Found invite in Hyperdrive");
          existing = inviteRecordFromJSON(JSON.parse(data.toString("utf-8")));
        } else {
          debugLog(this.debug, "Easybase", "No invite found in Hyperdrive");
        }
      } catch (error) {
        debugLog(
          this.debug,
          "Easybase",
          "Error getting invite from Hyperdrive",
          { error }
        );
        // Ignore errors when invite doesn't exist
      }
    } else {
      debugLog(this.debug, "Easybase", "Getting invite from Hyperbee view");
      try {
        const view = this.base.view as Hyperbee;

        const invite = await view.get("@easybase/invite", {
          keyEncoding: "utf-8",
          valueEncoding: "json",
        });

        if (invite) {
          debugLog(this.debug, "Easybase", "Found invite in Hyperbee");
          existing = inviteRecordFromJSON(invite.value);
        } else {
          debugLog(this.debug, "Easybase", "No invite found in Hyperbee");
        }
      } catch (error) {
        debugLog(this.debug, "Easybase", "Error getting invite from Hyperbee", {
          error,
        });
        // Ignore errors when invite doesn't exist
      }
    }

    if (existing) {
      debugLog(this.debug, "Easybase", "Returning existing invite", existing);
      return existing;
    }

    debugLog(this.debug, "Easybase", "No invite found");
    return undefined;
  }

  async createInvite(opts: { expires?: number } = {}): Promise<string> {
    debugLog(this.debug, "Easybase", "createInvite() called", opts);

    const existingInvite = await this.getInvite();

    if (existingInvite) {
      debugLog(this.debug, "Easybase", "Using existing invite");
      return z32.encode(existingInvite.invite);
    }

    debugLog(this.debug, "Easybase", "Creating new invite");
    // Create a simple invite since BlindPairing.createInvite is not available
    const { id, invite, publicKey, expires } = BlindPairing.createInvite(
      this.base.key!,
      {
        expires: opts.expires,
      }
    );

    const record: InviteRecord = {
      id: Buffer.from(id).toString("hex"),
      invite: Buffer.from(invite as Uint8Array),
      publicKey: Buffer.from(publicKey as Uint8Array),
      expires,
    };

    debugLog(this.debug, "Easybase", "Appending add-invite action");
    await this.base.append({
      type: "add-invite",
      record: inviteRecordToJSON(record),
    });
    await this.base.update();

    const encodedInvite = z32.encode(Buffer.from(record.invite));
    debugLog(this.debug, "Easybase", "Invite created successfully", record);

    return encodedInvite;
  }

  async deleteInvite(): Promise<void> {
    debugLog(this.debug, "Easybase", "deleteInvite() called");
    await this.ready();
    let existing: InviteRecord | null = null;

    if (this._isHyperdrive(this.base.view)) {
      debugLog(
        this.debug,
        "Easybase",
        "Getting invite from Hyperdrive for deletion"
      );
      try {
        const data = await this.base.view.get("invite.json");
        if (data) {
          existing = inviteRecordFromJSON(JSON.parse(data.toString("utf-8")));
          debugLog(
            this.debug,
            "Easybase",
            "Found invite to delete in Hyperdrive"
          );
        }
      } catch (error) {
        debugLog(
          this.debug,
          "Easybase",
          "Error getting invite from Hyperdrive for deletion",
          { error }
        );
        // Ignore errors when invite doesn't exist
      }
    } else {
      debugLog(
        this.debug,
        "Easybase",
        "Getting invite from Hyperbee for deletion"
      );
      try {
        existing = await this.base.view.findOne("@easybase/invite", {});
        if (existing) {
          debugLog(
            this.debug,
            "Easybase",
            "Found invite to delete in Hyperbee"
          );
        }
      } catch (error) {
        debugLog(
          this.debug,
          "Easybase",
          "Error getting invite from Hyperbee for deletion",
          { error }
        );
        // Ignore errors when invite doesn't exist
      }
    }

    if (existing) {
      debugLog(this.debug, "Easybase", "Appending del-invite action");
      await this.base.append({
        type: "del-invite",
        record: existing,
      });
      debugLog(this.debug, "Easybase", "Invite deletion action appended");
    } else {
      debugLog(this.debug, "Easybase", "No invite found to delete");
    }
  }

  async addWriter(key: Uint8Array | string): Promise<boolean> {
    debugLog(this.debug, "Easybase", "addWriter() called", {
      keyType: typeof key,
      keyLength: key
        ? typeof key === "string"
          ? key.length
          : key.byteLength
        : 0,
    });

    if (!key) {
      debugLog(this.debug, "Easybase", "ERROR: Writer key is required");
      throw new EasybaseError("Writer key is required", "INVALID_WRITER_KEY");
    }

    const keyBuffer = getKeyBuffer(key);

    debugLog(this.debug, "Easybase", "Appending add-writer action", {
      key: keyBuffer.toString("hex"),
    });
    await this.base.append({
      type: "add-writer",
      record: {
        key: keyBuffer.toString("hex"),
      },
    });
    await this.base.update();

    debugLog(this.debug, "Easybase", "Writer added successfully");
    return true;
  }

  async removeWriter(key: Uint8Array | string): Promise<void> {
    debugLog(this.debug, "Easybase", "removeWriter() called", {
      keyType: typeof key,
      keyLength: key
        ? typeof key === "string"
          ? key.length
          : key.byteLength
        : 0,
    });

    if (!key) {
      debugLog(this.debug, "Easybase", "ERROR: Writer key is required");
      throw new EasybaseError("Writer key is required", "INVALID_WRITER_KEY");
    }

    const keyBuffer = getKeyBuffer(key);

    debugLog(this.debug, "Easybase", "Appending remove-writer action");
    await this.base.append({
      type: "remove-writer",
      record: {
        key: keyBuffer.toString("hex"),
      },
    });

    debugLog(this.debug, "Easybase", "Writer removal action appended");
  }

  get writable(): boolean {
    const writable = this.base.writable;
    debugLog(this.debug, "Easybase", "writable getter called", { writable });
    return writable;
  }

  get view(): TViewType extends "default" ? Hyperbee : Hyperdrive {
    const view = this.base.view;
    debugLog(this.debug, "Easybase", "view getter called", { view });
    return view;
  }

  private async _replicate(): Promise<void> {
    debugLog(this.debug, "Easybase", "_replicate() called");

    await this.base.ready();
    debugLog(this.debug, "Easybase", "Base is ready for replication");

    if (this.swarm === null) {
      debugLog(
        this.debug,
        "Easybase",
        "Creating new Hyperswarm for replication"
      );
      this.swarm = new Hyperswarm();
      this.swarm.on("connection", (connection: any, peerInfo: any) => {
        debugLog(
          this.debug,
          "Easybase",
          "Swarm connection established during replication",
          {
            peerInfo: peerInfo ? { id: peerInfo.id?.toString("hex") } : null,
          }
        );
        this.store.replicate(connection);
      });
    }

    debugLog(this.debug, "Easybase", "Creating BlindPairing for replication");
    this.pairing = new BlindPairing(this.swarm);

    debugLog(this.debug, "Easybase", "Adding member to pairing");
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey!,
      onadd: async (candidate: any) => {
        const id = candidate.inviteId;
        debugLog(this.debug, "Easybase", "Member onadd callback triggered", {
          id,
        });

        try {
          debugLog(this.debug, "Easybase", "Getting existing invite");
          const existingInvite = await this.getInvite();

          if (!existingInvite) {
            debugLog(this.debug, "Easybase", "No existing invite found");
            return;
          }

          debugLog(this.debug, "Easybase", "Opening candidate with public key");
          await candidate.open(existingInvite.publicKey);
          debugLog(this.debug, "Easybase", "Candidate opened successfully");

          debugLog(this.debug, "Easybase", "Adding writer from candidate");
          await this.addWriter(candidate.userData as Uint8Array);

          debugLog(this.debug, "Easybase", "Confirming candidate", {
            baseKey: this.base.key
              ? this.base.key.toString("hex").substring(0, 16) + "..."
              : null,
            hasEncryptionKey: !!this.base.encryptionKey,
          });

          await candidate.confirm({
            key: this.base.key,
            encryptionKey: this.base.encryptionKey,
          });

          debugLog(this.debug, "Easybase", "Candidate confirmed successfully");
        } catch (error) {
          debugLog(this.debug, "Easybase", "Error in member onadd callback", {
            error,
          });
        }
      },
    });

    // @ts-expect-error Member.flushed is not typed
    await this.member.flushed();
    debugLog(this.debug, "Easybase", "Member flushed");

    const discoveryKey = this.topic || this.base.discoveryKey!;
    debugLog(this.debug, "Easybase", "Joining swarm with discovery key", {
      discoveryKey: discoveryKey.toString("hex").substring(0, 16) + "...",
    });

    const discovery = this.swarm.join(discoveryKey);

    // @ts-expect-error DiscoverySession.flushed is not typed
    await discovery.flushed();
    debugLog(this.debug, "Easybase", "Discovery session flushed");

    debugLog(this.debug, "Easybase", "_replicate() completed");
  }
}

function getKeyBuffer(key: Uint8Array | string): Buffer {
  if (typeof key === "string") {
    return Buffer.from(key, "hex");
  } else if (key instanceof Uint8Array) {
    return Buffer.from(key);
  } else {
    throw new EasybaseError("Invalid key type", "INVALID_KEY_TYPE");
  }
}

export type EasybaseWithActions<
  TActions extends Record<string, ActionFunction<any>>
> = Easybase<TActions> & ActionMethods<TActions>;

export type { ActionFunction };

export type Actions<TView = Hyperbee> = Record<string, ActionFunction<TView>>;

export type { EasybaseOptions };
