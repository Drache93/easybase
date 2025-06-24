import ReadyResource from "ready-resource";
import Autobase from "autobase";
interface EasybaseOptions {
    swarm?: any;
    bootstrap?: any;
    replicate?: boolean;
    key?: any;
    encryptionKey?: any;
    invitePublicKey?: any;
    viewType?: "default" | "hyperdrive";
    actions?: Record<string, (value: any, context: {
        view: any;
        base: any;
    }) => Promise<void>>;
}
export declare class EasybasePairer extends ReadyResource {
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
    constructor(store: any, invite: string, opts?: {
        bootstrap?: any;
    });
    _open(): Promise<void>;
    _whenWritable(): void;
    _close(): Promise<void>;
    finished(): Promise<unknown>;
}
export declare class Easybase extends ReadyResource {
    private store;
    private swarm;
    base: Autobase;
    private bootstrap;
    private member;
    private pairing;
    private replicate;
    private debug;
    private invitePublicKey;
    private viewType;
    private actions;
    constructor(corestore: any, opts?: EasybaseOptions);
    private _openView;
    private _createHyperdriveView;
    private _addInvite;
    private _delInvite;
    private _apply;
    _open(): Promise<void>;
    _close(): Promise<void>;
    get writerKey(): any;
    get key(): Buffer<ArrayBufferLike> | null;
    get discoveryKey(): Buffer<ArrayBufferLike> | null;
    get encryptionKey(): Buffer<ArrayBufferLike> | null;
    static pair(store: any, invite: string, opts: any): EasybasePairer;
    createInvite(opts?: any): Promise<string>;
    deleteInvite(): Promise<void>;
    addWriter(key: any): Promise<boolean>;
    removeWriter(key: any): Promise<void>;
    get writable(): boolean;
    get hyperdriveView(): any;
    get hyperbeeDb(): any;
    get hyperblobs(): any;
    private _replicate;
}
export type { EasybaseOptions };
//# sourceMappingURL=index.d.ts.map