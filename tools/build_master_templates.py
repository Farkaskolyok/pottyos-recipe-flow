import zipfile,copy,re,sys,shutil,os
from lxml import etree
WN='http://schemas.openxmlformats.org/wordprocessingml/2006/main'; W='{%s}'%WN
def txt(e): return ''.join(t.text or '' for t in e.iter(W+'t'))
class Doc:
  def __init__(s,src):
    s.src=src; s.z=zipfile.ZipFile(src); s.parts={}
    for n in s.z.namelist():
      if re.match(r'word/(document|header\d+|footer\d+)\.xml$',n): s.parts[n]=etree.fromstring(s.z.read(n))
    s.body=s.parts['word/document.xml'].find(W+'body'); s.ch=list(s.body)
  def _setp(s,p,text):
    runs=[r for r in p.findall(W+'r')]
    rpr=None
    for r in runs:
      if r.find(W+'t') is not None:
        x=r.find(W+'rPr'); rpr=copy.deepcopy(x) if x is not None else None; break
    for r in p:
      if r.tag in (W+'r',W+'hyperlink',W+'ins',W+'smartTag',W+'proofErr',W+'bookmarkStart',W+'bookmarkEnd'): p.remove(r)
    for r in list(p):
      if r.tag in (W+'r',): p.remove(r)
    if text=='' : return
    r=etree.SubElement(p,W+'r')
    if rpr is not None: r.append(rpr)
    t=etree.SubElement(r,W+'t'); t.text=text; t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
  def par(s,i,text): s._setp(s.ch[i],text)
  def rm(s,*idx):
    for i in idx: s.body.remove(s.ch[i])
  def rmr(s,a,b):
    for i in range(a,b+1):
      if s.ch[i].getparent() is not None: s.body.remove(s.ch[i])
  def cell(s,t,r,c,text,keep=0):
    tc=s.ch[t].findall(W+'tr')[r].findall(W+'tc')[c]; ps=tc.findall(W+'p')
    s._setp(ps[keep],text)
    for p in ps[keep+1:]: tc.remove(p)
  def lit(s,find,repl,parts=None):
    n=0
    for name,root in s.parts.items():
      if parts and not any(k in name for k in parts): continue
      for t in root.iter(W+'t'):
        if t.text and find in t.text: t.text=t.text.replace(find,repl); n+=1
    if n==0: print('  !lit miss',find)
  def plit(s,find,repl,parts):
    # paragraph-level replace in header/footer: rebuild text runs
    for name,root in s.parts.items():
      if not any(k in name for k in parts): continue
      for p in root.iter(W+'p'):
        if p.find('.//'+W+'p') is not None: continue
        ts=[t for t in p.iter(W+'t')]; j=''.join(t.text or '' for t in ts)
        if find in j and ts:
          j=j.replace(find,repl); ts[0].text=j
          ts[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
          for t in ts[1:]: t.text=''
  def save(s,out,leaks):
    tmp=out+'.tmp'
    with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as o:
      for n in s.z.namelist():
        if n=='docProps/core.xml': o.writestr(n,CORE); continue
        o.writestr(n, etree.tostring(s.parts[n],xml_declaration=True,encoding='UTF-8',standalone=True) if n in s.parts else s.z.read(n))
    shutil.move(tmp,out)
    for name,root in s.parts.items():
      j=' '.join(txt(p) for p in root.iter(W+'p'))
      for l in leaks:
        for m in re.finditer(re.escape(l),j): print('  LEAK',os.path.basename(out),name,l,'::',j[max(0,m.start()-40):m.end()+40])
    print('saved',out)
CORE='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title></dc:title><dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy></cp:coreProperties>'
LEAKS=['Pöttyös','PöTTYÖS','Túró Rudi','málna','Málna','38','106662','2106909855','Friesland','Mátészalk','Jármi','263','Popomájer','Kücsön','Mészárosné','1368','1398','2017','2018','5998200747953','06 80','pottyos.hu','27 nap','BOPP','44%']
OUT='/dev-server/public/templates/'
# ---------- GYL ----------
d=Doc('GYL_-_Pöttyös_Fitt_Túró_Rudi_málnás-müzlis_38g.docx')
d.par(6,'{{productNameUpper}}'); d.par(8,'{{description}}')
d.cell(10,0,0,'{{preparedBy}}',keep=2); d.cell(10,0,1,'{{responsible}}',keep=2); d.cell(10,0,2,'{{approver}}',keep=1)
tc=d.ch[10].findall(W+'tr')[2].findall(W+'tc')[0]; d._setp(tc.findall(W+'p')[0],'Érvénybe lépés dátuma: {{effectiveDate}}')
d.par(25,'{{manufacturer}}'); d.rm(26)
d.par(31,'{{plantName}}'); d.par(32,'{{plantAddress}}'); d.rm(33)
d.par(35,'Az üzem egészségügyi jele: {{healthMark}}')
d.par(39,'{{legalName}}'); d.par(40,'{{description}}')
d.par(44,'{{ingredientsList}}'); d.rmr(45,78)
d.par(82,'{{gmoStatement}}')
d.par(86,'{{processDescription}}'); d.rmr(87,92)
d.par(94,'A csomagolás formája: {{packagingForm}}'); d.rmr(95,97)
d.par(98,'Csomagolás módja: {{packagingMethod}}'); d.par(99,'Csomagolás zárása: {{packagingClosure}}')
d.par(100,'A csomagolóanyag típusa: {{packagingMaterial}}'); d.par(101,'Tömeg: {{productWeight}} {{weightTolerance}}')
d.par(105,'{{regs}}'); d.rmr(106,108)
d.cell(114,1,1,'{{micro}}')
for c in range(2,7): d.cell(114,1,c,'')
d.cell(114,1,0,'')
AL=['gluten','crustaceans','egg','fish','peanut','soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs']
for i,k in enumerate(AL): d.cell(143,i+1,1,'{{al_%s}}'%k)
d.par(150,'{{physical}}'); d.rm(151); d.rmr(153,155)
d.cell(159,1,1,'{{sensory}}'); d.cell(159,1,2,'')
for r in range(2,6): d.cell(159,r,1,''); d.cell(159,r,2,'')
N=['energy','fat_sat','carb_sug','tfa','protein','fibre','salt']
for i,k in enumerate(N):
  if k=='energy': d.cell(163,1,1,'{{n_energy}}')
  else: d.cell(163,i+1,1,'{{n_%s}}'%k)
d.par(167,'{{shelfLife}}'); d.par(169,'{{storage}}'); d.par(171,'{{labelling}}'); d.rmr(173,177)
for i in range(3):
  for c,k in enumerate(['v','d','n']): d.cell(179,i+2,c,'{{rev%d_%s}}'%(i,k))
d.lit('FrieslandCampina Hungária ZRt.','{{manufacturerName}}',['header']); d.lit('Mátészalkai üzeme','{{plantName}}',['header']); d.lit('2017-02-07','{{effectiveDate}}',['header'])
d.plit('Fitt Pöttyös Túró Rudi málnás-müzlis','{{productName}}',['footer'])
d.save(OUT+'GYL_MASTER.docx',LEAKS)
# ---------- SPEC ----------
d=Doc('106662_-_Pöttyös_Fitt_málna-müzli_jogh.b._38g.docx')
for r,k in [(0,'productName'),(1,'sapCode'),(2,'taricCode'),(3,'regs'),(5,'plantName'),(6,'plantAddressMark'),(7,'description'),(8,'recommendedUse'),(9,'consumerGroup'),(12,'packagingMaterial'),(14,'secondaryPackaging'),(20,'palletPackaging'),(30,'shelfLife'),(31,'distributionConditions')]:
  d.cell(2,r,1,'{{%s}}'%k)
d.cell(2,17,2,'{{caseNet}}'); d.cell(2,17,3,'{{caseUnits}}'); d.cell(2,18,2,'{{caseGross}}')
for r,k in [(24,'storage'),(25,'storageTemp'),(26,'storageHumidity'),(27,'transport'),(28,'transportTemp'),(29,'transportHumidity')]: d.cell(2,r,2,'{{%s}}'%k)
d.cell(6,2,0,'{{ingredientText}}'); d.cell(6,3,1,'{{recommendedUse}}')
for i,k in enumerate(N): d.cell(6,5+i,1,'{{n_%s}}'%k)
d.cell(6,14,2,'{{weightValue}}'); d.cell(6,14,3,'{{weightTolerance}}')
d.cell(6,17,2,'{{fatValue}}'); d.cell(6,17,3,'{{acceptanceRange}}')
d.cell(8,1,0,'{{micro}}')
for r in (1,2,3):
  for c in range(0 if r>1 else 1,5): d.cell(8,r,c,'')
d.cell(8,5,1,'{{sensory}}')
for r in (6,7,8,9): d.cell(8,r,1,'')
d.lit('FrieslandCampina Foqus standard','Belső szabvány')
SP=[('gluten',1,1),('milk',1,3),('crustaceans',2,1),('celery',2,3),('egg',3,1),('mustard',3,3),('fish',4,1),('sesame',4,3),('peanut',5,1),('sulphites',5,3),('soy',6,1),('licorice',6,3),('lupin',7,1),('molluscs',7,3),('nuts',8,1)]
for k,r,c in SP: d.cell(10,r,c,'{{al_%s}}'%k)
d.cell(21,0,0,'{{preparedBy}}',keep=1); d.cell(21,0,1,'{{reviewedBy}}',keep=1)
d.cell(21,1,0,'Dátum/Date: {{date}}'); d.cell(21,1,1,'Dátum/Date: {{reviewDate}}')
d.lit('FrieslandCampina Hungária ZRt.','{{manufacturerName}}',['header']); d.lit(' 2017.02.07.',' {{effectiveDate}}',['header']); d.lit(' 01',' {{docVersion}}',['header'])
d.save(OUT+'SPEC_MASTER.docx',LEAKS)
# ---------- LEGAL TEXT ----------
d=Doc('IMG_3008.docx')
d.par(4,'{{marketingName}}'); d.par(5,'{{variant}}'); d.par(7,'Egy adag: {{servingSize}}')
d.lit('531 kJ/ 127 kcal','{{frontServingEnergy}}'); d.lit('6%','{{riPct}}')
d.par(15,'{{energy100}}'); d.par(24,'{{marketingName}}'); d.par(25,'{{legalName}}'); d.par(27,'Nettó tömeg: {{productWeight}}*')
d.par(30,'{{ingredientsRich}}'); d.par(32,'{{mayContain}}'); d.par(34,'{{claims}}'); d.rm(35,36)
d.cell(39,0,2,'1 adag ({{servingSize}})')
for i,k in enumerate(['energy','fat','saturates','carbohydrate','sugars','protein','salt']):
  d.cell(39,i+1,1,'{{p100_%s}}'%k); d.cell(39,i+1,2,'{{psv_%s}}'%k)
d.par(40,'A csomag {{servingsPerPack}} adagot tartalmaz.'); d.par(45,'{{storageText}}'); d.par(48,'Gyártó: {{manufacturer}}')
d.lit('263','{{healthMarkNo}}',['document']); d.lit('4700 Mátészalka, Jármi út 24.','{{plantAddress}}')
d.par(52,'Info vonal: {{infoLine}}'); d.par(53,'{{website}}'); d.par(56,'Vonalkód: {{barcode}}')
d.lit('2018.07.12.','{{date}}',['footer'])
d.save(OUT+'LEGAL_TEXT_MASTER.docx',LEAKS)
