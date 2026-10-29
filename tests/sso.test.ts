import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SsoManager} from '../server/sso.ts';
import {readConfig} from '../server/config.ts';

test('mock SSO group selects valid provider and location and remains scoped to Brand', async () => {
 const m=new SsoManager(readConfig({}));
 await assert.rejects(m.create('1',{name:'Bad',provider:'MCD',locationIds:[99]}));
 assert.equal((await m.create('1',{name:'Group',provider:'YUM',locationIds:[18620836]})).status,'mock_success');
 assert.equal((await m.load('1')).groups[0].brands[0].id,18620836);
 assert.equal((await m.load('2')).groups.length,0);
});

test('live uses observed paths, sends selected location and verifies group', async () => {
 const config=readConfig({HARRI_MODE:'live',HARRI_ALLOW_REAL_REQUESTS:'true',HARRI_AUTH_HEADER_NAME:'Authorization',HARRI_AUTH_HEADER_VALUE:'test',HARRI_ALLOW_GROUP_CREATION:'true',HARRI_GROUP_ALLOWED_BRAND_ID:'18620833'});
 let created=false; let payload: unknown; const urls: string[]=[];
 const response=(body:unknown)=>({ok:()=>true,status:()=>200,json:async()=>body});
 const m=new SsoManager(config,async()=>({get:async(url)=>{urls.push(url); if(url.endsWith('/settings')) return response({data:{provider_type:'MULTIPLE',application_level:'GP-1'}}); if(url.includes('/brands?types=')) return response({data:{brands:[{id:18620836,name:'YUM auto'}]}}); if(url.endsWith('/channels')) return response({data:{channels:[{code:'YUM',title:'YUM'}]}}); return response({data:{groups:created?[{id:953,name:'Group',provider:'YUM',allow_employees_sso_login:false,brands:[{id:18620836,name:'YUM auto'}]}]:[]}});},post:async(url,opts)=>{urls.push(url);payload=opts.data;created=true;return response({data:'service group settings created successfully'});},dispose:async()=>{}}));
 const result=await m.create('18620833',{name:'Group',provider:'YUM',locationIds:[18620836]});
 assert.equal(result.status,'verified');
 assert.deepEqual(payload,{provider_type:'MULTIPLE',name:'Group',provider:'YUM',brands:[{id:18620836}],allow_employees_sso_login:false});
 assert.ok(urls.some(x=>x.includes('types=GP-1')));
});

test('a location cannot be reused in another group of the same Brand', async () => {
 const m=new SsoManager(readConfig({}));
 await m.create('1',{name:'First',provider:'YUM',locationIds:[18620836]});
 await assert.rejects(m.create('1',{name:'Second',provider:'MCD',locationIds:[18620836]}), (error: any) => error.code === 'LOCATION_ALREADY_ASSIGNED');
 assert.equal((await m.load('1')).groups.length,1);
});
