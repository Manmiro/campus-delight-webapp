import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const envEntries=fs.readFileSync('.env','utf8').split(/\r?\n/).map(line=>/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)).filter(Boolean).map(m=>({name:m[1],value:m[2].replace(/^['"]|['"]$/g,'')}));
const privateEntries=envEntries.filter(e=>/SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|PINGRAM_API_KEY|LOVABLE_API_KEY/.test(e.name)&&e.value.length>8);
const sourceFindings=[];
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['github-token',/gh[pousr]_[A-Za-z0-9_]{30,}/],['stripe-live-secret',/sk_live_[A-Za-z0-9]{16,}/],['supabase-secret',/sb_secret_[A-Za-z0-9_-]{15,}/]];
for(const path of tracked.filter(p=>!p.endsWith('.lock')&&!/\.(jpg|jpeg|png|webp|woff2|mp3|pdf)$/i.test(p))) {
 let source;try { source=fs.readFileSync(path,'utf8'); } catch { continue; }
 for(const [kind,re] of patterns) source.split(/\r?\n/).forEach((line,index)=>{if(re.test(line)) sourceFindings.push({path,line:index+1,kind});});
}
let publicFiles=0;const leakedNames=new Set();
function walk(path) { if(!fs.existsSync(path))return;for(const entry of fs.readdirSync(path,{withFileTypes:true})){const file=`${path}/${entry.name}`;if(entry.isDirectory())walk(file);else if(/\.(js|mjs|html|css|map)$/.test(entry.name)){publicFiles++;const value=fs.readFileSync(file,'utf8');for(const secret of privateEntries)if(value.includes(secret.value))leakedNames.add(secret.name);}} }
walk('.output/public');
const result={trackedFiles:tracked.length,trackedEnv:tracked.includes('.env'),envKeys:envEntries.map(e=>e.name),privateEnvironmentKeyNames:privateEntries.map(e=>e.name),sourceFindings,publicBundleFilesScanned:publicFiles,privateKeyNamesFoundInPublicBundle:[...leakedNames]};
fs.writeFileSync('security-audit/inventory.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
