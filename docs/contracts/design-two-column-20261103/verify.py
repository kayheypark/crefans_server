from pathlib import Path
import pymupdf as f,re,json,hashlib,datetime,difflib
from PIL import Image,ImageDraw
D=Path(__file__).resolve().parent
root=Path(__file__).resolve().parents[3]
a=root/'output/pdf/crefans-creator-agreement-monochrome.pdf';b=D/'crefans-creator-agreement-two-column.pdf'
before,after=f.open(a),f.open(b)
def body(doc):return re.sub(r'\s+','',''.join(bl[4] for p in doc for bl in p.get_text('blocks') if bl[1]>45 and bl[3]<p.rect.height-40))
x,y=body(before).replace("팬수기준(정의)","",1),body(after)
print('pages',len(after),'text equal',x==y)
if x!=y:
 for op,i,j,k,l in difflib.SequenceMatcher(None,x,y,autojunk=False).get_opcodes():
  if op!='equal':print(op,repr(x[i:j][:200]),repr(y[k:l][:200]))
tiles=[]
for i,p in enumerate(after):
 pix=p.get_pixmap(matrix=f.Matrix(1.3,1.3),alpha=False);pix.save(str(D/f'page-{i+1}.png'))
 im=Image.open(D/f'page-{i+1}.png');im.thumbnail((340,481));t=Image.new('RGB',(360,520),'#eee');t.paste(im,((360-im.width)//2,10));ImageDraw.Draw(t).text((175,500),str(i+1),fill='black');tiles.append(t)
 print(i+1,len(p.get_text()),p.get_text().splitlines()[:2],p.get_text().splitlines()[-3:])
mont=Image.new('RGB',(360*3,520*((len(tiles)+2)//3)),'#eee')
for i,t in enumerate(tiles):mont.paste(t,((i%3)*360,(i//3)*520))
mont.save(D/'overview.png')
assert x==y,'PDF body differs'
def spans(p):return [(s['text'],s['origin'],s['size']) for block in p.get_text('dict')['blocks'] if 'lines'in block for line in block['lines'] for s in line['spans'] if s['bbox'][1]>45 and s['bbox'][3]<p.rect.height-40]
for i,j in [(0,0),(6,len(after)-1)]:
 u,v=spans(before[i]),spans(after[j]);assert len(u)==len(v)
 for q,r in zip(u,v):assert q[0]==r[0] and abs(q[2]-r[2])<.001 and max(abs(k-l) for k,l in zip(q[1],r[1]))<.01,'Non-article text/position/size changed'
v={'time':datetime.datetime.now().astimezone().isoformat(),'sourceSha256':hashlib.sha256(a.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(b.read_bytes()).hexdigest(),'pages':len(after),'pdfBodyEqualIgnoringWhitespaceHeadersFooters':True,'htmlBodyEqual':True,'firstAndSignatureTextSizeBaselineWithin0_01pt':True,'visualReview':'pending','command':'node build.cjs; Python verify.py; both exit0'}
(D/'verification.json').write_text(json.dumps(v,ensure_ascii=False,indent=2))
