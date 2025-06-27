import ReadyResource from "ready-resource";
import Autobase from "autobase";
import Hyperswarm from "hyperswarm";
import Hyperdrive from "hyperdrive";
import Hyperbee from "hyperbee";
import type Corestore from "corestore";
export declare class EasybaseError extends Error {
    code?: string | undefined;
    constructor(message: string, code?: string | undefined);
}
export declare class EasybasePairingError extends EasybaseError {
    constructor(message: string);
}
type ActionFunction<TView> = (value: any, context: {
    view: TView;
    base: Autobase;
}) => Promise<void>;
type ActionMethods<TActions> = {
    [K in keyof TActions]: TActions[K] extends ActionFunction<any> ? (value: Parameters<TActions[K]>[0]) => Promise<void> : never;
};
type EasybaseOptions<TActions extends Record<string, ActionFunction<any>> = {}> = EasybaseOptionsDefault<TActions> | EasybaseOptionsHyperdrive<TActions>;
type EasybasePairerOptions<TActions extends Record<string, ActionFunction<any>> = {}> = EasybasePairerOptionsDefault<TActions> | EasybasePairerOptionsHyperdrive<TActions>;
type ViewType = "default" | "hyperdrive";
interface EasybaseOptionsBase<TActions extends Record<string, ActionFunction<any>> = {}> {
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
export interface EasybasePairerOptionsDefault<TActions extends Record<string, ActionFunction<Hyperbee>> = {}> extends EasybasePairerBaseOptions {
    viewType: "default";
    actions: TActions;
}
export interface EasybasePairerOptionsHyperdrive<TActions extends Record<string, ActionFunction<Hyperdrive>> = {}> extends EasybasePairerBaseOptions {
    viewType: "hyperdrive";
    actions: TActions;
}
interface EasybaseOptionsDefault<TActions extends Record<string, ActionFunction<Hyperbee>> = {}> extends EasybaseOptionsBase<TActions> {
    viewType: "default";
    actions?: TActions;
    debug?: boolean;
}
interface EasybaseOptionsHyperdrive<TActions extends Record<string, ActionFunction<Hyperdrive>> = {}> extends EasybaseOptionsBase<TActions> {
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
export declare class EasybasePairer<TActions extends Record<string, ActionFunction<any>> = {}, TViewType extends ViewType = "default"> extends ReadyResource {
    private store;
    private invite;
    private swarm;
    private pairing;
    private candidate;
    private onresolve;
    private onreject;
    private easybase;
    private viewType;
    private updateListener;
    private topic;
    private debug;
    private actions;
    constructor(store: Corestore, invite: string, opts: EasybasePairerOptions<TActions>);
    _open(): Promise<void>;
    private _whenWritable;
    private _cleanupUpdateListener;
    _close(): Promise<void>;
    finished(): Promise<Easybase<TActions>>;
}
export declare class Easybase<TActions extends Record<string, ActionFunction<any>> = {}, TViewType extends "default" | "hyperdrive" = "default"> extends ReadyResource {
    private store;
    base: Autobase;
    swarm: Hyperswarm;
    private bootstrap;
    private member;
    private pairing;
    private topic;
    private viewType;
    private actions;
    private debug;
    private replicate;
    [key: string]: any;
    constructor(corestore: Corestore, opts: EasybaseOptions<TActions>);
    static pair(store: Corestore, invite: string, opts: EasybasePairerOptionsDefault | EasybasePairerOptionsHyperdrive): EasybasePairer;
    static generateTopic(topic: string): string;
    private _openView;
    private _createDefaultView;
    private _createHyperdriveView;
    private _isHyperdrive;
    private _addInvite;
    private _delInvite;
    private _apply;
    _open(): Promise<void>;
    _close(): Promise<void>;
    get writerKey(): Buffer;
    get key(): Buffer;
    get discoveryKey(): Buffer;
    getInvite(): Promise<InviteRecord | undefined>;
    createInvite(opts?: {
        expires?: number;
    }): Promise<string>;
    deleteInvite(): Promise<void>;
    addWriter(key: Uint8Array | string): Promise<boolean>;
    removeWriter(key: Uint8Array | string): Promise<void>;
    get writable(): boolean;
    get view(): TViewType extends "default" ? Hyperbee : Hyperdrive;
    private _replicate;
}
export type EasybaseWithActions<TActions extends Record<string, ActionFunction<any>>> = Easybase<TActions> & ActionMethods<TActions>;
export type { ActionFunction };
export type Actions<TView = Hyperbee> = Record<string, ActionFunction<TView>>;
export type { EasybaseOptions };
//# sourceMappingURL=index.d.ts.map