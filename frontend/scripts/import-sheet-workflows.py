"""Read the user's XLSX snapshot; retain only workflow definitions, never contacts."""
import json, re, zipfile, xml.etree.ElementTree as E
from pathlib import Path
from datetime import datetime, timezone

N = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
SOURCE = 'https://docs.google.com/spreadsheets/d/1V47wt8GM90cde8EclExsM_7iA4kwHBBfqITlc858pps/edit?gid=1535430592'
def order(value):
    try: return str(int(float(value))) if float(value).is_integer() else value
    except ValueError: return value
def col_number(value):
    result=0
    for char in value: result=result*26+ord(char)-64
    return result
def coord(value):
    match=re.fullmatch(r'([A-Z]+)([0-9]+)',value)
    return col_number(match[1]),int(match[2])

plans=[]
with zipfile.ZipFile('work/sheet-import/source.xlsx') as z:
    shared=[''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',N)] if 'xl/sharedStrings.xml' in z.namelist() else []
    rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for sheet in E.fromstring(z.read('xl/workbook.xml')).find('s:sheets',N):
        name=sheet.attrib['name']
        if name not in ['WORKFLOWS','Copy of WORKFLOWS']: continue
        target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        root=E.fromstring(z.read(path)); raw={}
        for row in root.findall('s:sheetData/s:row',N):
            for cell in row:
                v=cell.find('s:v',N)
                value=v.text if v is not None else ''.join(cell.find('s:is',N).itertext()) if cell.find('s:is',N) is not None else ''
                if cell.attrib.get('t')=='s': value=shared[int(value)]
                if value: raw[coord(cell.attrib['r'])]=value.strip()
        filled=dict(raw)
        for merge in root.findall('s:mergeCells/s:mergeCell',N):
            first,last=merge.attrib['ref'].split(':'); c1,r1=coord(first);c2,r2=coord(last)
            for c in range(c1,c2+1):
                for r in range(r1,r2+1):filled[c,r]=raw.get((c1,r1),'')
        sheet_plans={}
        for row in range(2, max(r for _,r in raw)+1):
            for base,lane in [(2,'main'),(8,'parallel'),(14,'parallel-2')]:
                # Read only original task anchors: merged task cells must not duplicate work.
                title=raw.get((base+3,row),'')
                if not title:continue
                workflow=filled.get((1,row),'') or ('Copy of WORKFLOWS' if name=='Copy of WORKFLOWS' else '')
                code=order(filled.get((base,row),''))
                stage_name=filled.get((base+1,row),'')
                if not workflow or not code or not stage_name:raise ValueError(f'Missing stage for {name} row {row}')
                plan=sheet_plans.setdefault(workflow,{'id':('copy-' if name.startswith('Copy') else '')+re.sub('[^a-z0-9]+','-',workflow.lower()).strip('-'),'name':workflow,'sheet':name,'stages':[]})
                stage=next((s for s in plan['stages'] if s['code']==code and s['lane']==lane),None)
                if stage is None:
                    stage={'id':f'{plan["id"]}-{lane}-{code}','code':code,'name':stage_name,'lane':lane,'sourceRow':row,'tasks':[]}
                    if lane!='main':
                        anchor=next((s for s in plan['stages'] if s['lane']=='main' and s['code']==order(filled.get((2,row),''))),None)
                        stage['parallelAnchor']={'stageCode':order(filled.get((2,row),'')),'row':row}
                    plan['stages'].append(stage)
                value=filled.get((base+4,row),'')
                duration=float(value) if value else None
                if duration is not None and duration<=0:raise ValueError('Non-positive duration')
                task_col={2:'E',8:'K',14:'Q'}[base]
                stage['tasks'].append({'id':f'{plan["id"]}-{task_col}{row}','title':title,'order':order(filled.get((base+2,row),'')),'durationDays':duration,'role':filled.get((base+5,row),'') or None,'sourceCell':f'{task_col}{row}','sourceRow':row})
        for plan in sheet_plans.values():
            plan['stages'].sort(key=lambda s:(int(re.match(r'[0-9]+',s['code'])[0]),s['code']))
            plan['taskCount']=sum(len(s['tasks']) for s in plan['stages'])
            plans.append(plan)
output={'sourceUrl':SOURCE,'sourceTab':'WORKFLOWS','fetchedAt':datetime.now(timezone.utc).isoformat(),'durationUnit':'calendar-days','defaultPlanId':'interior-1','plans':plans}
Path('frontend/src/data/sheet-workflows.json').write_text(json.dumps(output,indent=2)+'\n')
print([(p['name'],p['sheet'],len(p['stages']),p['taskCount']) for p in plans])
print('Missing durations:',[(p['name'],s['code'],t['sourceCell'],t['title']) for p in plans for s in p['stages'] for t in s['tasks'] if t['durationDays'] is None])
