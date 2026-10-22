import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,symlink,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {generateKeyPairSync,createSign} from 'node:crypto';
const clientId='123456-integration.apps.googleusercontent.com';

test('Google admission, linking, founder sign-in and sessions work over HTTP without bypassing project access',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'iksha-google-')),source=path.dirname(fileURLToPath(import.meta.url));
 await cp(source,path.join(directory,'backend'),{recursive:true,filter:p=>!p.endsWith('.test.js') && !p.endsWith('data.json')});
 await cp(path.join(source,'../package.json'),path.join(directory,'package.json'));
 await symlink(path.join(source,'../node_modules'),path.join(directory,'node_modules'));
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});
 const mock=path.join(directory,'mock-certs.js');
 await writeFile(mock,`import {OAuth2Client} from 'google-auth-library';OAuth2Client.prototype.getFederatedSignonCertsAsync=async()=>({certs:{test:${JSON.stringify(keys.publicKey.export({type:'spki',format:'pem'}))}}});`);
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const base=`http://127.0.0.1:${port}`;let child;
 const call=async(route,method='GET',input,cookie='',headers={})=>{
  const response=await fetch(base+route,{method,headers:{'content-type':'application/json',...headers,...(cookie?{cookie}:{})},...(input?{body:JSON.stringify(input)}:{})});
  return {status:response.status,data:await response.json(),cookies:response.headers.getSetCookie()};
 };
 const start=async()=>{
  child=spawn(process.execPath,['--import',mock,path.join(directory,'backend/server.js')],{cwd:directory,env:{...process.env,PORT:String(port),FOUNDER_PASSWORD:'test-founder-password',NODE_ENV:'test',GOOGLE_CLIENT_ID:clientId,DATABASE_URL:'',APP_DATA_FILE:'',PUBLIC_URL:base},stdio:'ignore'});
  for(let i=0;i<60;i++){try{await call('/api/auth/google/config');return;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
  throw Error('Test server did not start.');
 };
 const stop=async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}};
 t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});await start();
 const credentials=(nonce,identity={})=>{
  const now=Math.floor(Date.now()/1000),payload={iss:'https://accounts.google.com',aud:clientId,iat:now,exp:now+3600,sub:'person-1',email:'person@example.com',email_verified:true,name:'New Person',nonce,...identity};
  const data=Buffer.from(JSON.stringify({kid:'test',alg:'RS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
  return data+'.'+createSign('RSA-SHA256').update(data).sign(keys.privateKey,'base64url');
 };
 const challenge=async(mode='login',cookie='')=>{
  const result=await call('/api/auth/google/challenge','POST',{mode},cookie);assert.equal(result.status,200);assert.match(result.cookies[0],/HttpOnly/);return {nonce:result.data.nonce,cookie:result.cookies[0].split(';')[0]};
 };
 const signIn=async(identity={},mode='login',ownerCookie='')=>{
  const flow=await challenge(mode,ownerCookie);
  const result=await call('/api/auth/google/sign-in','POST',{credential:credentials(flow.nonce,identity),nonce:flow.nonce},[ownerCookie,flow.cookie].filter(Boolean).join('; '));
  return {...result,flow};
 };
 assert.equal((await call('/api/auth/google/config')).data.clientId,clientId);
 assert.equal((await call('/api/auth/google/challenge','POST',{},'',{origin:'https://attacker.example'})).status,403);
 assert.equal((await call('/api/founder/google/accounts')).status,401);
 const pending=await signIn();assert.equal(pending.status,200);assert.equal(pending.data.status,'Pending');assert.equal(pending.data.redirect,'');assert.ok(!pending.cookies.some(value=>value.startsWith('iksha_employee=')));
 assert.equal((await call('/api/employee/me')).status,401);
 assert.equal((await call('/api/auth/google/sign-in','POST',{credential:credentials(pending.flow.nonce),nonce:pending.flow.nonce},pending.flow.cookie)).status,401,'used nonce cannot be replayed');
 await stop();await start();await signIn();
 const login=await call('/api/founder/login','POST',{password:'test-founder-password'}),ownerCookie=login.cookies[0].split(';')[0];
 let accounts=(await call('/api/founder/google/accounts','GET',undefined,ownerCookie)).data.accounts;
 assert.equal(accounts.length,1,'repeat/restart does not duplicate the same Google identity');assert.ok(!('subject' in accounts[0]));
 const project=(await call('/api/founder/projects','POST',{name:'Google assigned home'},ownerCookie)).data.project;
 const other=(await call('/api/founder/projects','POST',{name:'Private other home'},ownerCookie)).data.project;
 const existing=(await call('/api/founder/employees','POST',{name:'Existing Person',designation:'Designer',role:'Designer',projectId:project.id,password:'test-staff-password',email:'person@example.com'},ownerCookie)).data.employee;
 const review=`/api/founder/google/accounts/${accounts[0].id}/decision`;
 assert.equal((await call(review,'POST',{status:'Approved',employeeId:existing.id,projectIds:[project.id],role:'Designer'})).status,401);
 assert.equal((await call(review,'POST',{status:'Approved',employeeId:existing.id,projectIds:[project.id],role:'Designer'},ownerCookie)).status,200);
 const signed=await signIn();assert.equal(signed.data.redirect,'/employee');
 const staffCookie=signed.cookies.find(value=>value.startsWith('iksha_employee=')).split(';')[0];
 const me=await call('/api/employee/me','GET',undefined,staffCookie);assert.equal(me.data.employee.id,existing.id);assert.equal(me.data.projects.length,1);
 assert.equal((await call(`/api/employee/projects/${other.id}/workspace`,'GET',undefined,staffCookie)).status,404);
 assert.equal((await call('/api/founder/projects','GET',undefined,staffCookie)).status,401);
 assert.equal((await call('/api/employee/login','POST',{employeeId:existing.id,password:'test-staff-password'})).status,200,'legacy password sign-in remains available');
 assert.equal((await call(review,'POST',{status:'Rejected'},ownerCookie)).status,200);
 assert.equal((await call('/api/employee/me','GET',undefined,staffCookie)).status,401,'rejecting access revokes Google sessions');
 assert.equal((await signIn()).data.status,'Rejected');
 await signIn({sub:'person-2',email:'second@example.com'});
 accounts=(await call('/api/founder/google/accounts','GET',undefined,ownerCookie)).data.accounts;
 const second=accounts.find(account=>account.email==='second@example.com');
 assert.equal((await call(`/api/founder/google/accounts/${second.id}/decision`,'POST',{status:'Approved',projectIds:[],role:'Designer'},ownerCookie)).status,200);
 const secondLogin=await signIn({sub:'person-2',email:'second@example.com'}),secondCookie=secondLogin.cookies.find(value=>value.startsWith('iksha_employee=')).split(';')[0];
 const newProfile=(await call('/api/employee/me','GET',undefined,secondCookie)).data;
 assert.equal(newProfile.projects.length,0);assert.equal((await call('/api/employee/login','POST',{employeeId:newProfile.employee.id,password:''})).status,401,'Google-only profiles fail password login cleanly');
 const founderIdentity={sub:'owner-google',email:'owner@example.com',name:'Owner'};
 assert.equal((await call('/api/auth/google/challenge','POST',{mode:'link-founder'})).status,401);
 assert.equal((await signIn(founderIdentity,'link-founder',ownerCookie)).status,200);
 const founderLogin=await signIn(founderIdentity);assert.equal(founderLogin.data.redirect,'/');
 const googleFounderCookie=founderLogin.cookies.find(value=>value.startsWith('iksha_founder=')).split(';')[0];
 assert.equal((await call('/api/founder/projects','GET',undefined,googleFounderCookie)).status,200);
});
