import ReadyResource from "ready-resource";
import Autobase from "autobase";
import Hyperswarm from "hyperswarm";
import BlindPairing, { type Candidate } from "blind-pairing";
import Hyperdrive from "hyperdrive";
import type Corestore from "corestore";
import type { Core } from "corestore";
type ActionFunction<TView> = (value: any, context: {
    view: TView;
    base: Autobase;
}) => Promise<void>;
type EasybaseOptions<TActions extends Record<string, ActionFunction<any>> = {}> = EasybaseOptionsDefault<TActions> | EasybaseOptionsHyperdrive<TActions>;
interface EasybaseOptionsBase<TActions extends Record<string, ActionFunction<any>> = {}> {
    swarm?: Hyperswarm;
    bootstrap?: any;
    replicate?: boolean;
    key?: any;
    encryptionKey?: any;
    invitePublicKey?: any;
    viewType?: "default" | "hyperdrive";
    actions?: TActions;
}
interface EasybaseOptionsDefault<TActions extends Record<string, ActionFunction<Core>> = {}> extends EasybaseOptionsBase<TActions> {
    viewType: "default";
    actions?: TActions;
}
interface EasybaseOptionsHyperdrive<TActions extends Record<string, ActionFunction<Hyperdrive>> = {}> extends EasybaseOptionsBase<TActions> {
    viewType: "hyperdrive";
    actions?: TActions;
}
export declare class EasybasePairer extends ReadyResource {
    store: Corestore | null;
    invite: string;
    swarm: Hyperswarm | null;
    pairing: BlindPairing | null;
    candidate: Candidate | null;
    bootstrap: string | null;
    onresolve: ((value: Easybase<any>) => void) | null;
    onreject: ((reason: Error) => void) | null;
    easybase: Easybase<any> | null;
    base: Autobase | null;
    viewType: "default" | "hyperdrive";
    constructor(store: Corestore, invite: string, opts?: {
        bootstrap?: string;
        viewType?: "default" | "hyperdrive";
    });
    _open(): Promise<void>;
    _whenWritable(): void;
    _close(): Promise<void>;
    finished(): Promise<unknown>;
}
export declare class Easybase<TActions extends Record<string, ActionFunction<any>> = {}> extends ReadyResource {
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
    [key: string]: any;
    constructor(corestore: Corestore, opts: EasybaseOptions<TActions>);
    private _openView;
    private _createHyperdriveView;
    private _isHyperdrive;
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