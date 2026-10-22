import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {createGoogleAuthRoutes,verifyGoogleCredential} from './google-auth.js';
const clientId='123456-test.apps.googleusercontent.com';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const client=new OAuth2Client();
client.getFederatedSignonCertsAsync=async()=>({certs:{test:publicKey.export({type:'spki',format:'pem'})}});
const jwt=changes=>{
 const now=Math.floor(Date.now()/1000),payload={iss:'https://accounts.google.com',sub:'123456789',aud:clientId,iat:now,exp:now+3600,nonce:'browser-nonce',email:'person@example.com',email_verified:true,name:'Person',...changes};
 const text=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
 return text+'.'+createSign('RSA-SHA256').update(text).sign(privateKey,'base64url');
};
test('Google verification rejects forged, expired, wrong-client, wrong-issuer, unverified and replayed credentials',async()=>{
 const options={clientId,nonce:'browser-nonce',client};
 assert.equal((await verifyGoogleCredential(jwt(),options)).subject,'123456789');
 for(const changes of [{aud:'other-client'},{iss:'https://attacker.example'},{exp:1},{email_verified:false},{nonce:'other-browser'},{sub:''}])await assert.rejects(verifyGoogleCredential(jwt(changes),options),/could not be verified/);
 const forged=jwt().split('.');forged[1]=Buffer.from(JSON.stringify({email:'founder@example.com'})).toString('base64url');
 await assert.rejects(verifyGoogleCredential(forged.join('.'),options),/could not be verified/);
});
function fixture() {
 const state={projects:[{id:'p',status:'Active',members:[]},{id:'other',status:'Active',members:[]}],employees:[],employeeSessions:[],founderSessions:[],googleAccounts:[],googleChallenges:[]};
 const identity={subject:'google-person',email:'person@example.com',name:'Person'};
 const founder=req=>req.founder?{idHash:req.founderHash || 'founder-session'}:null;
 const route=createGoogleAuthRoutes({getState:()=>state,founder,body:async req=>req.input,json:(res,status,data,headers={})=>Object.assign(res,{status,data,headers}),save:async()=>{},audit:()=>{},cookie:(name,value)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict`,clientId,verify:async(credential)=>{if(credential!=='verified')throw Error('bad token');return {...identity};}});
 const call=async(path,input={},options={})=>{
  const res={};try{await route({method:options.method || 'POST',input,founder:options.founder,founderHash:options.founderHash,headers:{'content-type':'application/json',cookie:options.cookie || ''},socket:{remoteAddress:'test'}},res,new URL('https://app.example'+path));}catch(error){res.status=error.status || 500;res.data={error:error.message};}return res;
 };
 const challenge=async(options={})=>{const res=await call('/api/auth/google/challenge',{mode:options.mode || 'login'},options);return {nonce:res.data.nonce,cookie:res.headers?.['set-cookie']?.split(';')[0] || '',status:res.status};};
 const signIn=async(options={})=>{const flow=await challenge(options);return call('/api/auth/google/sign-in',{credential:'verified',nonce:flow.nonce},{...options,cookie:flow.cookie});};
 return {state,identity,call,challenge,signIn};
}
test('new Google accounts stay pending without sessions or project grants, and repeated sign-in reuses the identity',async()=>{
 const h=fixture(),first=await h.signIn();assert.equal(first.data.status,'Pending');assert.equal(first.data.redirect,'');
 await h.signIn();assert.equal(h.state.googleAccounts.length,1);assert.equal(h.state.employees.length,0);assert.equal(h.state.employeeSessions.length,0);assert.equal(h.state.founderSessions.length,0);assert.equal(h.state.projects[0].members.length,0);
});
test('nonce is browser-bound, expires and cannot be replayed after a successful verification',async()=>{
 const h=fixture(),flow=await h.challenge(),input={credential:'verified',nonce:flow.nonce};
 assert.equal((await h.call('/api/auth/google/sign-in',input)).status,401);
 assert.equal((await h.call('/api/auth/google/sign-in',{...input,nonce:'wrong'},{cookie:flow.cookie})).status,401);
 assert.equal((await h.call('/api/auth/google/sign-in',input,{cookie:flow.cookie})).status,200);
 assert.equal((await h.call('/api/auth/google/sign-in',input,{cookie:flow.cookie})).status,401);
 const expired=await h.challenge();h.state.googleChallenges[0].expiresAt=1;
 assert.equal((await h.call('/api/auth/google/sign-in',{credential:'verified',nonce:expired.nonce},{cookie:expired.cookie})).status,401);
});
test('only a founder can approve Google access, preserving existing profiles and selected project scope',async()=>{
 const h=fixture();await h.signIn();const id=h.state.googleAccounts[0].id,path=`/api/founder/google/accounts/${id}/decision`;
 h.state.employees.push({id:'existing',name:'Existing person',email:'person@example.com',active:true});
 assert.equal((await h.call(path,{status:'Approved',employeeId:'existing',projectIds:['p']})).status,401);
 assert.equal((await h.call(path,{status:'Approved',projectIds:['missing']},{founder:true})).status,400);assert.equal(h.state.employees.length,1);
 assert.equal((await h.call(path,{status:'Approved',employeeId:'existing',projectIds:['p'],role:'Designer'},{founder:true})).status,200);
 assert.equal(h.state.employees.length,1);assert.equal(h.state.projects[0].members[0].employeeId,'existing');assert.equal(h.state.projects[1].members.length,0);
 const signed=await h.signIn();assert.equal(signed.data.redirect,'/employee');assert.equal(h.state.employeeSessions[0].employeeId,'existing');assert.equal(h.state.founderSessions.length,0);
 assert.equal((await h.call(path,{status:'Approved'},{founder:true})).status,409);
});
test('rejection and disabled staff profiles prevent Google access and revoke Google sessions',async()=>{
 const h=fixture();await h.signIn();const path=`/api/founder/google/accounts/${h.state.googleAccounts[0].id}/decision`;
 await h.call(path,{status:'Approved',projectIds:['p']},{founder:true});assert.equal(h.state.employees.length,1);
 await h.signIn();assert.equal(h.state.employeeSessions.length,1);
 h.state.employees[0].active=false;assert.equal((await h.signIn()).status,403);
 await h.call(path,{status:'Rejected'},{founder:true});assert.equal(h.state.employeeSessions.length,0);
 const denied=await h.signIn();assert.equal(denied.data.status,'Rejected');assert.equal(denied.data.redirect,'');
});
test('founder Google linking requires the same authenticated founder session and explicit linking mode',async()=>{
 const h=fixture();assert.equal((await h.challenge({mode:'link-founder'})).status,401);
 await h.signIn();assert.equal(h.state.googleAccounts[0].kind,'employee');
 const flow=await h.challenge({mode:'link-founder',founder:true});
 assert.equal((await h.call('/api/auth/google/sign-in',{credential:'verified',nonce:flow.nonce},{cookie:flow.cookie,founder:true,founderHash:'other-session'})).status,401);
 const linked=await h.call('/api/auth/google/sign-in',{credential:'verified',nonce:flow.nonce},{cookie:flow.cookie,founder:true});assert.equal(linked.status,200);assert.equal(h.state.googleAccounts[0].kind,'founder');
 const signed=await h.signIn();assert.equal(signed.data.redirect,'/');assert.equal(h.state.founderSessions.length,1);
});
