import { request } from "playwright";
import type { Config } from "./config.ts";
import { validateBrandId } from "./brand.ts";
import { ApiError } from "./errors.ts";

type Response = { ok(): boolean; status(): number; json(): Promise<unknown> };
type Context = { get(url: string, options: {maxRedirects: number}): Promise<Response>; post(url: string, options: {data: unknown; maxRedirects: number}): Promise<Response>; dispose(): Promise<void> };
type Factory = (options: {extraHTTPHeaders: Record<string,string>; timeout: number; ignoreHTTPSErrors: boolean}) => Promise<Context>;
type Location = {id: number; name: string};
type Channel = {code: string; title: string};
type Group = {id: number; name: string; provider: string; brands: Location[]; allow_employees_sso_login: boolean};
const root = "https://gateway.harriprep.com";
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
function data(body: unknown): Record<string, unknown> { if (!object(body) || !object(body.data)) throw new ApiError(502,"INVALID_RESPONSE","Unexpected Harri response."); return body.data; }
function locations(body: unknown): Location[] { const v=data(body).brands; if (!Array.isArray(v) || !v.every(x => object(x) && Number.isSafeInteger(x.id) && typeof x.name === "string")) throw new ApiError(502,"INVALID_RESPONSE","Invalid locations response."); return v as Location[]; }
function channels(body: unknown): Channel[] { const v=data(body).channels; if (!Array.isArray(v) || !v.every(x => object(x) && typeof x.code === "string" && typeof x.title === "string")) throw new ApiError(502,"INVALID_RESPONSE","Invalid providers response."); return v as Channel[]; }
function groups(body: unknown): Group[] { const v=data(body).groups; if (!Array.isArray(v) || !v.every(x => object(x) && Number.isSafeInteger(x.id) && typeof x.name === "string" && typeof x.provider === "string" && Array.isArray(x.brands) && x.brands.every((b: unknown) => object(b) && Number.isSafeInteger(b.id) && typeof b.name === "string") && typeof x.allow_employees_sso_login === "boolean")) throw new ApiError(502,"INVALID_RESPONSE","Invalid groups response."); return v as Group[]; }
export class SsoManager {
  private mockGroups = new Map<string, Group[]>();
  private attempts = new Set<string>();
  private reservedLocations = new Set<string>();
  constructor(private config: Config, private factory: Factory = opts => request.newContext(opts)) {}
  get available() { return this.config.mode === "mock" || (this.config.approved && this.config.groupWritesEnabled && !!this.config.groupAllowedBrandId); }
  private async context() { if (!this.config.approved) throw new ApiError(403,"LIVE_DISABLED","Live requests are disabled."); return this.factory({extraHTTPHeaders:this.config.headers,timeout:15000,ignoreHTTPSErrors:false}); }
  private async read(ctx: Context, url: string) { const r=await ctx.get(url,{maxRedirects:0}); if (!r.ok()) throw new ApiError(r.status() === 401 ? 401 : r.status() === 403 ? 403 : 502,"HARRI_REQUEST_FAILED",`Harri request failed (HTTP ${r.status()}).`); try { return await r.json(); } catch { throw new ApiError(502,"INVALID_RESPONSE","Harri returned invalid JSON."); } }
  async load(raw: unknown) {
    const id=validateBrandId(raw);
    if (this.config.mode === "mock") return {mode:"mock",settings:{provider_type:"MULTIPLE",application_level:"GP-1"},locations:[{id:18620834,name:"MCD auto"},{id:18620835,name:"KFC auto"},{id:18620836,name:"YUM auto"}],providers:[{code:"MCD",title:"Mcdonalds"},{code:"KFC",title:"Kfc"},{code:"YUM",title:"YUM"}],groups:this.mockGroups.get(id) ?? []};
    const ctx=await this.context();
    try {
      const base=`${root}/account-management/api/v1/admin/brands/${id}/services/SSO/settings`;
      const settings=data(await this.read(ctx,base));
      if (typeof settings.application_level !== "string" || !/^GP-[1-5]$/.test(settings.application_level) || settings.provider_type !== "MULTIPLE") throw new ApiError(422,"UNSUPPORTED_SSO_SETTINGS","This tool supports confirmed MULTIPLE SSO settings with a GP application level.");
      const [l,p,g]=await Promise.all([this.read(ctx,`${root}/core/api/v1/admin/brands/${id}/brands?types=${encodeURIComponent(settings.application_level)}&include_general_settings=false`),this.read(ctx,`${root}/core/api/v1/admin/sso/channels`),this.read(ctx,`${base}/groups`)]);
      return {mode:"live",settings:{provider_type:settings.provider_type,application_level:settings.application_level},locations:locations(l),providers:channels(p),groups:groups(g)};
    } finally { await ctx.dispose().catch(()=>{}); }
  }
  async create(raw: unknown, input: unknown) {
    const id=validateBrandId(raw);
    if (!this.available || (this.config.mode === "live" && id !== this.config.groupAllowedBrandId)) throw new ApiError(403,"GROUP_WRITE_DISABLED","Group creation is disabled or this Brand is not approved.");
    if (!object(input) || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120 || typeof input.provider !== "string" || !Array.isArray(input.locationIds) || !input.locationIds.length || !input.locationIds.every(x => Number.isSafeInteger(x) && x > 0) || new Set(input.locationIds).size !== input.locationIds.length) throw new ApiError(400,"INVALID_GROUP","Enter a group name, provider and at least one location.");
    const name=input.name.trim(), provider=input.provider, ids=input.locationIds as number[];
    const snapshot=await this.load(id);
    if (!snapshot.providers.some(p=>p.code===provider) || ids.some(x=>!snapshot.locations.some(l=>l.id===x))) throw new ApiError(400,"INVALID_SELECTION","Provider or locations are unavailable for this Brand.");
    if (snapshot.groups.some(g=>g.brands.some(b=>ids.includes(b.id)))) throw new ApiError(409,"LOCATION_ALREADY_ASSIGNED","One or more selected locations already belong to an SSO group. Reload and choose available locations.");
    if (snapshot.groups.some(g=>g.name.toLowerCase()===name.toLowerCase())) throw new ApiError(409,"GROUP_EXISTS","A group with this name already exists.");
    const payload={provider_type:"MULTIPLE",name,provider,brands:ids.map(x=>({id:x})),allow_employees_sso_login:false};
    if (this.config.mode === "mock") { this.mockGroups.set(id, [...(this.mockGroups.get(id) ?? []), {id:Date.now(),name,provider,brands:snapshot.locations.filter(l=>ids.includes(l.id)),allow_employees_sso_login:false}]); return {status:"mock_success",message:"Simulated group created in mock mode."}; }
    const key=`${id}:${name.toLowerCase()}`;
    if (this.attempts.has(key)) throw new ApiError(409,"PREVIOUS_ATTEMPT","Check Harri before retrying this group name.");
    const locationKeys=ids.map(location => `${id}:${location}`);
    if (locationKeys.some(k=>this.reservedLocations.has(k))) throw new ApiError(409,"LOCATION_PENDING","A selected location has a pending or unverified creation. Check BAM before proceeding.");
    locationKeys.forEach(k=>this.reservedLocations.add(k));
    this.attempts.add(key);
    let ctx: Context | undefined;
    try {
      ctx=await this.context();
      const response=await ctx.post(`${root}/account-management/api/v1/admin/brands/${id}/services/SSO/settings/groups`,{data:payload,maxRedirects:0});
      if (!response.ok()) { if (response.status() >= 400 && response.status() < 500 && ![408,429].includes(response.status())) { this.attempts.delete(key); locationKeys.forEach(k=>this.reservedLocations.delete(k)); return {status:"rejected",message:`Harri rejected the request (HTTP ${response.status()}).`}; } return {status:"uncertain",message:`HTTP ${response.status()}; check Harri before retrying.`}; }
      let body: unknown; try { body=await response.json(); } catch { return {status:"uncertain",message:"Unexpected response; check Harri before retrying."}; }
      if (!object(body) || body.data !== "service group settings created successfully") return {status:"uncertain",message:"Unexpected response; check Harri before retrying."};
      try { const list=groups(await this.read(ctx,`${root}/account-management/api/v1/admin/brands/${id}/services/SSO/settings/groups`)); const match=list.find(g=>g.name===name && g.provider===provider && g.allow_employees_sso_login===false && g.brands.length===ids.length && ids.every(i=>g.brands.some(b=>b.id===i))); if (match) locationKeys.forEach(k=>this.reservedLocations.delete(k)); return match ? {status:"verified",message:`Group created and verified in Harri (ID ${match.id}).`} : {status:"acknowledged",message:"Harri accepted the request, but the group could not be verified yet."}; } catch { return {status:"acknowledged",message:"Harri accepted the request, but verification failed. Check Group Management."}; }
    } catch { return {status:"uncertain",message:"Request outcome is unknown. Check Harri before retrying."}; } finally { await ctx?.dispose().catch(()=>{}); }
  }
}
