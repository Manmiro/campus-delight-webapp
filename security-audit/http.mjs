// Read-only HTTP requests. No login, checkout, delivery, or mutation calls.
import fs from 'node:fs';
const results=[];
const names=['content-security-policy','content-security-policy-report-only','x-frame-options','x-content-type-options','referrer-policy','strict-transport-security','permissions-policy','access-control-allow-origin','cache-control','location'];
for(const url of ['https://campus-delight-webapp.lovable.app','https://www.campusdelight.net']) {
 try {const r=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});results.push({url,status:r.status,headers:Object.fromEntries(names.map(name=>[name,r.headers.get(name)]))});}
 catch(error){results.push({url,error:error.message});}
}
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).map(line=>/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['"]|['"]$/g,'')]));
try {
 const r=await fetch(`${env['VITE_SUPABASE_URL'].replace(/\/$/,'')}/auth/v1/settings`,{headers:{apikey:env['VITE_SUPABASE_PUBLISHABLE_KEY']},signal:AbortSignal.timeout(15000)});
 const data=await r.json();
 results.push({authPublicSettingsStatus:r.status,settings:{disable_signup:data.disable_signup,mailer_autoconfirm:data.mailer_autoconfirm,phone_autoconfirm:data.phone_autoconfirm,external:data.external}});
} catch(error){results.push({authPublicSettingsError:error.message});}
fs.writeFileSync('security-audit/http-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
