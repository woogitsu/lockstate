"""Decode old canonical versus actual historical replay and corrected physical Guard."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parents[2];p=r/'assets/intermediate/guard-legacy-render-fit';d=r/'docs/research/2026-10-03-guard-legacy-render-fit';old=json.loads((p/'original-canonical-guard.json').read_text());new=json.loads((r/'public/game-content/oblique-actor-guard.v1.json').read_text());rows=[];changes=[]
for f in old['frames']:
 original=p/Path(f['image']).name;a=Image.open(original).convert('RGBA');q=p/f"original-replayed-yaw{f['yawDegrees']:+03d}-elev{f['elevationDegrees']}.png";b=Image.open(q).convert('RGBA');ab=a.tobytes();bb=b.tobytes();assert ab==bb,str(f);assert hashlib.sha256(original.read_bytes()).hexdigest()==f['sha256']
 rows.append({'yawDegrees':f['yawDegrees'],'elevationDegrees':f['elevationDegrees'],'canonicalSha256':f['sha256'],'replaySha256':hashlib.sha256(q.read_bytes()).hexdigest(),'exactDecodedRgba':True,'exactAlpha':True,'canonicalAlphaBounds':a.getchannel('A').getbbox()})
 n=next(n for n in new['frames'] if n['yawDegrees']==f['yawDegrees'] and n['elevationDegrees']==f['elevationDegrees']);np=r/'public'/n['image'].lstrip('/');c=Image.open(np).convert('RGBA');cb=c.tobytes();changed=sum(ab[i:i+4]!=cb[i:i+4] for i in range(0,len(ab),4));assert hashlib.sha256(np.read_bytes()).hexdigest()==n['sha256'];changes.append({'yawDegrees':f['yawDegrees'],'elevationDegrees':f['elevationDegrees'],'physicalBandDeltaPixels':changed,'correctedFrameSha256':n['sha256'],'correctedBounds':c.getchannel('A').getbbox()})
(d/'original-canonical72-replay.json').write_text(json.dumps({'frames':rows,'all72PixelExact':True,'sourceUnchanged':True,'byteEncoderDiffersFromLegacy':True},indent=2)+'\n');(d/'canonical-physical-deltas.json').write_text(json.dumps(changes,indent=2)+'\n')
files=[r/'public/game-content/oblique-actor-guard.v1.json']+[r/'public'/f['image'].lstrip('/') for f in new['frames']];(p/'first-export-hashes.json').write_text(json.dumps({q.relative_to(r).as_posix():hashlib.sha256(q.read_bytes()).hexdigest() for q in files},indent=2)+'\n')
canvas=Image.new('RGB',(1440,1100),(227,232,236));draw=ImageDraw.Draw(canvas)
for i,yaw in enumerate([0,45,90,-180]):
 f=next(f for f in old['frames'] if f['yawDegrees']==yaw and f['elevationDegrees']==45);n=next(f for f in new['frames'] if f['yawDegrees']==yaw and f['elevationDegrees']==45)
 for j,(label,img) in enumerate([('Original published legacy',Image.open(p/Path(f['image']).name)),('Corrected69part legacy fit',Image.open(r/'public'/n['image'].lstrip('/')))]):
  cut=img.convert('RGBA').crop((225,145,290,275)).resize((260,520),Image.Resampling.NEAREST);canvas.paste(cut,(i*360+45,j*550+30),cut);draw.text((i*360+8,j*550+8),f'{label} yaw{yaw}/45',fill='black')
canvas.save(d/'actual-original-versus-physical-guard-legacy-fit.png')
print('72 original decodedPIXEL_EXACT; corrected physical deltas',[(x['yawDegrees'],x['physicalBandDeltaPixels']) for x in changes if x['elevationDegrees']==45 and x['yawDegrees'] in [0,45,90,-180]])
