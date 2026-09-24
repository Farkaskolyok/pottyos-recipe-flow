"""Builds the hashed historical-value denylist used by the master-template leak test.

Input: text of the historical company Word documents (converted locally to .txt).
Every token of the historical documents is a potential product value unless it is explicitly
classified STATIC (tools/static_allowlist.json: structural wording, law numbers, section numbers).
Only SHA-256 hashes are stored, so no confidential historical value is kept in the repository.
Usage: python tools/historical_denylist.py hist1.txt hist2.txt ...
"""
import sys,re,json,hashlib,os
TOK=r'[0-9A-Za-zÀ-ž][0-9A-Za-zÀ-ž.,/%-]*[0-9A-Za-zÀ-ž%]|[0-9]'
norm=lambda t: t.lower()
h=lambda t: hashlib.sha256(norm(t).encode()).hexdigest()[:20]
root=os.path.dirname(os.path.abspath(__file__))
allow=set(map(norm,json.load(open(os.path.join(root,'static_allowlist.json'),encoding='utf-8'))))
H=set()
for f in sys.argv[1:]: H|=set(re.findall(TOK,open(f,encoding='utf-8',errors='ignore').read()))
deny=sorted({h(t) for t in H if norm(t) not in allow})
out=os.path.join(root,'..','src','test','fixtures','historical-denylist.json')
json.dump({'note':'SHA-256 (first 20 hex) of lowercased historical tokens not classified STATIC','hashes':deny},open(out,'w'),indent=0)
print(len(deny),'hashes')
