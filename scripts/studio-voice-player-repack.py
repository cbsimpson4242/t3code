"""Replace only the shipped browser UI in a verified official Linux desktop."""
from pathlib import Path
import struct,json,hashlib,copy,shutil
root=Path(__file__).resolve().parents[1]
archive=root/'.packaged/squashfs-root/resources/app.asar'
original=root/'.packaged/original-app.asar'
if not original.exists():shutil.copyfile(archive,original)
with original.open('rb') as f:
 a,b,c,d=struct.unpack('<4I',f.read(16)); header=json.loads(f.read(d)); data_start=8+b
 def walk(node,p=''):
  for name,value in node.get('files',{}).items():
   q=(p+'/'+name).lstrip('/')
   if 'files' in value:yield from walk(value,q)
   else:yield q,value
 old=dict(walk(header))
 fresh=copy.deepcopy(header)
 fresh['files']['apps']['files']['server']['files']['dist']['files']['client']={'files':{}}
 def set_entry(path,value):
  node=fresh
  parts=path.split('/')
  for name in parts[:-1]:node=node.setdefault('files',{}).setdefault(name,{'files':{}})
  node.setdefault('files',{})[parts[-1]]=value
 sources={}
 for p in sorted((root/'apps/web/dist').rglob('*')):
  if not p.is_file():continue
  rel='apps/server/dist/client/'+p.relative_to(root/'apps/web/dist').as_posix()
  content=p.read_bytes(); n=4194304
  entry={'size':len(content),'offset':'0','integrity':{'algorithm':'SHA256','hash':hashlib.sha256(content).hexdigest(),'blockSize':n,'blocks':[hashlib.sha256(content[i:i+n]).hexdigest() for i in range(0,len(content),n)]}}
  set_entry(rel,entry);sources[rel]=p
 position=0
 for path,v in walk(fresh):
  if 'link' in v or v.get('unpacked'):continue
  v['offset']=str(position);position+=v['size']
 text=json.dumps(fresh,separators=(',',':')).encode(); pad=(-len(text))%4
 header_pickle=struct.pack('<II',len(text)+pad+4,len(text))+text+b'\0'*pad
 out=archive.with_suffix('.candidate')
 with out.open('wb') as w:
  w.write(struct.pack('<II',4,len(header_pickle)));w.write(header_pickle)
  for path,v in walk(fresh):
   if 'link' in v or v.get('unpacked'):continue
   if path in sources:w.write(sources[path].read_bytes())
   else:
    previous=old[path];f.seek(data_start+int(previous['offset']));data=f.read(previous['size']);assert len(data)==previous['size'];w.write(data)
 # Read back every non-UI packed file from the completed candidate.
 with out.open('rb') as verify:
  new_start=8+len(header_pickle)
  unchanged=0
  for path,v in walk(fresh):
   if path.startswith('apps/server/dist/client/') or 'link' in v or v.get('unpacked'):continue
   previous=old[path];f.seek(data_start+int(previous['offset']));before=f.read(previous['size'])
   verify.seek(new_start+int(v['offset']));assert verify.read(v['size'])==before,path
   unchanged+=1
 out.replace(archive)
receipt={'original_sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'unchanged_non_ui_packed_files':unchanged,'new_ui_files':len(sources),'backend_modified':False}
(root/'.packaged/ui-only-repack.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
