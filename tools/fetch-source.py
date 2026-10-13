# Download public source audio for local comparison; do not commit audio files.
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import subprocess,concurrent.futures,json,re,hashlib,sys
class P(HTMLParser):
 def __init__(self):super().__init__();self.heading=False;self.text='';self.name='';self.rows=[]
 def handle_starttag(self,tag,attrs):
  if tag=='h3':self.heading=True;self.text=''
  if tag=='audio':
   url=dict(attrs).get('src','');u=urlparse(url)
   if u.scheme=='https' and u.hostname=='pokearcade.jp' and re.fullmatch(r'[A-Za-z0-9_-]+\.mp3',Path(u.path).name):self.rows.append((self.name,url))
 def handle_data(self,data):
  if self.heading:self.text+=data
 def handle_endtag(self,tag):
  if tag=='h3':self.heading=False;self.name=self.text.split('–')[-1].strip()
root=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/frienda-source');root.mkdir(parents=True,exist_ok=True)
page=root/'source.html'
subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','30','https://pokearcade.jp/%e3%82%a8%e3%82%af%e3%82%b9%e3%83%88%e3%83%ac%e3%82%b8%e3%83%a3%e3%83%bc2%e5%bc%be-%e9%b3%b4%e3%81%8d%e5%a3%b0/','-o',str(page)],check=True)
p=P();p.feed(page.read_text());
if len(p.rows)!=13:raise RuntimeError('Expected 13 source audio entries; inspect page before proceeding')
def download(row):
 name,url=row;file=Path(urlparse(url).path).name;subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','30',url,'-o',str(root/file)],check=True)
 return {'id':file,'name':name,'session':'source-site-direct','split':'test','file':file,'source':url,'sha256':hashlib.sha256((root/file).read_bytes()).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(download,p.rows))
(root/'manifest.json').write_text(json.dumps({'purpose':'source-comparison','recordings':rows},ensure_ascii=False,indent=2))
print('Downloaded source MP3s:',len(rows));print('Labels:',[r['name'] for r in rows])
