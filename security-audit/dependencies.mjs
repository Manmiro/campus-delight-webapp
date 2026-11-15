import fs from 'node:fs';
import ts from 'typescript';
const lock = ts.parseConfigFileTextToJson('bun.lock',fs.readFileSync('bun.lock','utf8'));
if (lock.error) throw new Error('Could not parse bun.lock');
const packages = [...new Map(Object.values(lock.config.packages).filter(Array.isArray).map(entry => {
  const descriptor = entry[0];
  const split = descriptor.lastIndexOf('@');
  return [descriptor,{name:descriptor.slice(0,split),version:descriptor.slice(split+1)}];
})).values()].filter(p=>/^\d/.test(p.version));
console.log(`Checking ${packages.length} exact locked package versions against OSV`);
const findings=[];
for(let index=0;index<packages.length;index+=100) {
 const chunk=packages.slice(index,index+100);
 const response=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({queries:chunk.map(p=>({package:{name:p.name,ecosystem:'npm'},version:p.version}))}),signal:AbortSignal.timeout(20000)});
 if(!response.ok) throw new Error(`OSV HTTP ${response.status}`);
 const batch=await response.json();
 for(let j=0;j<chunk.length;j++) if(batch.results[j]?.vulns?.length) findings.push({...chunk[j],advisories:batch.results[j].vulns});
 console.log(`Checked ${Math.min(index+100,packages.length)}/${packages.length}`);
}
const details={};
for(const id of new Set(findings.flatMap(f=>f.advisories.map(v=>v.id)))) {
 const response=await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,{signal:AbortSignal.timeout(15000)});
 if(response.ok) details[id]=await response.json();
}
fs.writeFileSync('security-audit/dependencies.json',JSON.stringify({checkedAt:new Date().toISOString(),packagesChecked:packages.length,findings,details},null,2)+'\n');
console.log(JSON.stringify(findings.map(f=>({...f,advisories:f.advisories.map(v=>({id:v.id,summary:details[v.id]?.summary,severity:details[v.id]?.database_specific?.severity}))})),null,2));
