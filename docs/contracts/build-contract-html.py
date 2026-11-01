from pathlib import Path
import re,html,os
ROOT=Path(__file__).resolve().parents[2]
os.chdir(ROOT)
FONT=Path(os.environ.get("CREFANS_CONTRACT_FONT",str(ROOT.parent/"crefans_guide/public/fonts/Pretendard-Regular.subset.woff2")))
assert FONT.is_file(), "Set CREFANS_CONTRACT_FONT to a Korean woff2 font"
s=Path('docs/contracts/crefans-creator-agreement-draft-20261030.txt').read_text();e=html.escape
articles=[]
for m in re.finditer(r'^(제\d+조[^\n]+)\n(.*?)(?=^제\d+조|^별지 A\.)',s,re.M|re.S):
 paragraphs=''.join('<p class="clause">'+e(x)+'</p>' for x in m[2].strip().splitlines() if x)
 articles.append('<section class="article"><h2>'+e(m[1])+'</h2>'+paragraphs+'</section>')
assert len(articles)==13, 'Expected 13 articles; update parser and verification when structure changes'
# Annex A value cells are filled in by hand: '[a / b   ]' becomes checkboxes (spaces -> a write-in line),
# '[   ]' or '[확정 필요…]' a large write-in box (the note stays as a small hint), outside ' / ' starts a new line.
def option(t):
 m=re.match(r'^(.*?)(\s{3,})(.*)$',t)
 body=e(t.strip()) if not m else e(m[1].strip())+' <span class="line" style="width:'+str(max(22,len(m[2])*2.2))+'mm"></span>'+e(m[3].strip())
 return '<span class="opt">☐&nbsp;'+body+'</span>'
def bracket(t):
 inner=t.strip()
 if not inner:return '<span class="box"></span>'
 # '[년 월 일]' is a date written by hand on underlines (2026-10-31 사용자 지시: 계약 기간).
 if re.fullmatch(r'년\s*월\s*일',inner):return ''.join('<span class="line" style="width:'+w+'mm"></span>'+u for w,u in [('16','년'),('9','월'),('9','일')])
 if inner.startswith('확정 필요'):return '<span class="box"></span><span class="hint">'+e(inner)+'</span>'
 parts=[x for x in re.split(r'\s/\s',t) if x.strip()]
 return '　'.join(option(x) for x in parts) if len(parts)>1 else e(inner)
def fill(b):
 out=[];pos=0
 for m in re.finditer(r'\[([^\]]*)\]',b):
  lead=e(b[pos:m.start()]).replace(' / ','<br>');out.append(lead+('&nbsp;&nbsp;' if lead.strip() and not lead.endswith('<br>') else ''));out.append(bracket(m[1]));pos=m.end()
 out.append(e(b[pos:]).replace(' / ','<br>'));return ''.join(out)
# Small explanation under an annex A row title (2026-10-31 사용자 지시).
desc={'멤버십 공제율':'회원(팬 등)의 멤버십 구매 시 수수료율'}
annex=s.split('별지 A. 개별 거래조건 확인표\n')[1].split('\n서명')[0];rows=[]
for line in annex.strip().splitlines():
 if line.startswith('※'):continue
 a,sep,b=line.partition(':');rows.append('<tr><th>'+e(a)+(('<small class="desc">'+e(desc[a])+'</small>') if a in desc else '')+'</th><td>'+fill(b.strip())+'</td></tr>')
style=Path('docs/contracts/layout/contract.css').read_text().replace('__FONT_URI__',FONT.resolve().as_uri())
parties=Path('docs/contracts/layout/parties.html').read_text()
Path('tmp/pdfs').mkdir(parents=True,exist_ok=True)
body='<h1>크레팬스 크리에이터<br>플랫폼 이용계약서</h1><p class="intro">아래 크레팬스(이하 \'회사\')와 크리에이터(이하 \'을\')는 회사 플랫폼 이용에 관하여 다음과 같이 계약을 체결한다.</p>'+parties+''.join(articles)
body+='<div class="annex"><h1>별지 A. 개별 거래조건 확인표</h1><table>'+''.join(rows)+'</table><div class="signature"><h1>계약 확인 및 서명</h1><p>각 당사자는 본문·별지 및 적용 약관 사본을 제공받았음을 확인한다.</p><p>이 계약을 전자계약으로 체결하는 경우 계약서의 동일성은 해당 전자계약 서비스의 전자서명과 체결 기록으로 확인하고, 서면으로 체결하는 경우 양 당사자가 각 장에 간인하여 그 내용을 확인한다.</p><p class="date">　　　　년　　　월　　　일</p><table><tr><td><b>크레팬스(회사)</b><br><br>상호: 좋아하는일해야지<br>대표자: 박경호<br>&nbsp;<br><p class="signline">서명 또는 날인:　　　　　　　　(인)</p></td><td><b>크리에이터(을)</b><br><br>성명:<br>상호(해당 시):<br>대표자(해당 시):<br><p class="signline">서명 또는 날인:　　　　　　　　(인)</p></td></tr></table></div></div>'
Path('tmp/pdfs/contract-formal.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><title>크레팬스 크리에이터 플랫폼 이용계약서</title><style>'+style+'</style><body>'+body+'</body></html>')
