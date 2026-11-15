import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const parts=readdirSync('prototype-source').filter(n=>n.startsWith('part-')).sort();
const html=gunzipSync(Buffer.concat(parts.map(n=>readFileSync('prototype-source/'+n))));
if(createHash('sha256').update(html).digest('hex')!=='56e36e4970909a6b9909530f5d39d0f58df4b512fa8d55437eb6d218e1b4b819')throw Error('Prototype integrity mismatch');
mkdirSync('public/prototype',{recursive:true});
writeFileSync('public/prototype/index.html',html);
console.log('Exact uploaded prototype prepared and SHA-256 verified.');
