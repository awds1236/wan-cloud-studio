import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
export function createLocalJobs({launch=spawn,python=path.join(root,'.venv-local','Scripts','python.exe'),directory=root}={}) {
  const jobs=new Map();let active=null;
  return {
    ready:()=>existsSync(python) && existsSync(path.join(root,'.venv-local','ready.txt')),
    async submit(input) {
      if(active) throw Error('이미 로컬 작업이 실행 중입니다. 완료 또는 취소 후 다시 생성하세요.');
      const id=randomUUID();const job={id,status:'IN_PROGRESS',message:'모델 준비 중'};
      active=id;jobs.set(id,job);
      try {
        const work=path.join(directory,'.local-jobs');await mkdir(work,{recursive:true});
        const inputPath=path.join(work,id+'.json');await writeFile(inputPath,JSON.stringify(input));
        const child=launch(python,['-u',path.join(root,'local','generate.py'),'--input',inputPath,'--output',path.join(directory,'outputs',id+'.mp4')],{cwd:directory,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
        job.child=child;let tail='';
        for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{const text=chunk.toString();tail=(tail+text).slice(-3000);job.message=text.trim().slice(-700);process.stdout.write(text);});
        const fail=error=>{if(job.status!=='CANCELLED'){job.status='FAILED';job.error=error;}if(active===id)active=null;};
        child.on('error',error=>fail(error.message));
        child.on('close',code=>{if(job.status==='IN_PROGRESS'){if(code===0&&existsSync(path.join(directory,'outputs',id+'.mp4'))){job.status='COMPLETED';job.output={video_url:'/outputs/'+id+'.mp4',seed:input.seed};}else fail(tail||'로컬 생성 프로세스가 종료되었습니다.');}if(active===id)active=null;});
        return {id,status:job.status};
      } catch(error){active=null;job.status='FAILED';throw error;}
    },
    status(id){const job=jobs.get(id);if(!job)return null;const {child,...publicJob}=job;return publicJob;},
    cancel(id){const job=jobs.get(id);if(!job)return null;if(job.status==='IN_PROGRESS'){job.child?.kill();job.status='CANCELLED';}return {id,status:job.status};},
    stop(){for(const job of jobs.values())if(job.status==='IN_PROGRESS')job.child?.kill();}
  };
}
