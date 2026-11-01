from pathlib import Path
import pymupdf as fitz,json,hashlib
root=Path(__file__).resolve().parents[2]
file=root/'output/pdf/crefans-creator-agreement-draft.pdf'
pdf=fitz.open(file)
text=''.join(p.get_text() for p in pdf)
assert all('제'+str(i)+'조' in text for i in range(1,14))
assert '별지 A.' in text and '별지 B.' not in text and '계약 확인 및 서명' in text
render=root/'tmp/pdfs/contract-review';render.mkdir(parents=True,exist_ok=True)
for i,page in enumerate(pdf):
 for block in page.get_text('blocks'):
  assert 0<=block[0]<block[2]<=page.rect.width and 0<=block[1]<block[3]<=page.rect.height
 page.get_pixmap().save(str(render/f'page-{i+1}.png'))
result={'pages':len(pdf),'articles':13,'annexes':1,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'automated':'PASS; page bounds and headings only','visualReview':'REQUIRED after regeneration','renders':str(render)}
(root/'tmp/pdfs/contract-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False))
