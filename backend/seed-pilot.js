// Creates isolated sample data only. Refuses to replace an existing file.
import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { workflows } from './pilot.js';
const filename = process.argv[2];
if (!filename || process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) throw new Error('Pass a new local demo JSON filename with production and DATABASE_URL unset.');
const password = randomBytes(18).toString('base64url');
const at = new Date().toISOString();
const employees = ['NEHA','AARAV'].map((name) => { const salt = randomBytes(16).toString('hex'); return {id:`EMP-PILOT-${name}`,name,designation:'Designer',active:true,passwordSalt:salt,passwordHash:scryptSync(password,salt,64).toString('hex'),createdAt:at}; });
const project = {id:'p_pilot_demo',name:'Pilot sample home',clientName:'Maya (sample)',clientTelegramId:'42',location:'Demo',status:'Setup',phase:'Setup',members:employees.map((e)=>({id:'member-'+e.id,employeeId:e.id,name:e.name,designation:e.designation,role:'Designer'})),createdAt:at};
const output = resolve(filename); await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({projects:[project],employees},null,2),{flag:'wx',mode:0o600});
console.log(`Demo data: ${output}\nEmployee IDs: ${employees.map((e)=>e.id).join(', ')}\nTemporary sample employee password: ${password}\nWorkflow IDs: ${workflows.map((w)=>w.id).join(', ')}\nStart server with APP_DATA_FILE pointing at this file and your own FOUNDER_PASSWORD.`);
