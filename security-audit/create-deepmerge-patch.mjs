import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const base='node_modules/.cache/security-deepmerge';
let patch='';
for (const file of ['dist/cjs.js','dist/umd.js','index.js']) {
 const original=fs.readFileSync(`node_modules/deepmerge/${file}`,'utf8').replaceAll('\r\n','\n');
 let updated=original.replace(/(function propertyIsUnsafe\(target, key\) \{\n)([\t ]*)/,
  (_,head,indent)=>`${head}${indent}if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;\n${indent}`);
 updated=updated.replace(/(getKeys\(target\)\.forEach\(function\(key\) \{\n)([\t ]*)/,
  (_,head,indent)=>`${head}${indent}if (propertyIsUnsafe(target, key)) return;\n${indent}`);
 if(updated===original || !updated.includes("key === '__proto__'")) throw new Error(`Patch did not apply: ${file}`);
 for(const [dir,content] of [['original',original],['updated',updated]]) {
  const path=`${base}/${dir}/${file}`;
  fs.mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});fs.writeFileSync(path,content);
 }
 let diff;
 try { diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',`${base}/original/${file}`,`${base}/updated/${file}`],{encoding:'utf8'}); }
 catch(error){if(error.status!==1)throw error;diff=error.stdout;}
 patch+=diff.replaceAll(`a/${base}/original/`,'a/').replaceAll(`b/${base}/updated/`,'b/');
}
fs.mkdirSync('patches',{recursive:true});fs.writeFileSync('patches/deepmerge@4.3.1.patch',patch);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.patchedDependencies={...pkg.patchedDependencies,'deepmerge@4.3.1':'patches/deepmerge@4.3.1.patch'};
pkg.dependencies.zod='^4.6.6';pkg.devDependencies.vitest='5.0.3';
pkg.overrides={...pkg.overrides,
 'seroval':'1.6.11','shell-quote':'1.11.0','launch-editor':'2.14.2','js-yaml':'4.3.2','nanoid':'3.3.18','source-map-js':'1.2.2',
 '@esbuild-kit/core-utils':{'esbuild':'0.25.12'},
 '@typescript-eslint/typescript-estree':{'minimatch':'11.0.1'},
 'minimatch@^3':{'brace-expansion':'1.1.21'},
 'minimatch@^11':{'brace-expansion':'5.0.12'},
 'zod':'^4.6.6'};
fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('Created reproducible deepmerge source patch and scoped security version overrides');
