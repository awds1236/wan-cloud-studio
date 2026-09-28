import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validate} from './validation.mjs';

export function createApp({key='', endpoint='', request=fetch}={}) {
  const configured = Boolean(key && /^[a-zA-Z0-9_-]+$/.test(endpoint));
  const jobs = new Set();
  async function upstream(path, body) {
    const response = await request(`https://api.runpod.ai/v2/${endpoint}/${path}`, {
      method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${key}`, 'Content-Type':'application/json'},
      ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Runpod 요청 실패 (${response.status}). 계정 잔액과 엔드포인트 설정을 확인하세요.`);
    return response.json();
  }
  return http.createServer(async (req,res) => {
    const send = (status, data) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data));};
    try {
      const origin = `http://${req.headers.host}`;
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '') || (req.headers.origin && req.headers.origin !== origin)) return send(403,{error:'로컬 화면에서만 접근할 수 있습니다.'});
      const path = new URL(req.url,origin).pathname;
      if(req.method==='GET' && path==='/') {
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return res.end(await readFile(new URL('./public/index.html',import.meta.url)));
      }
      if(req.method==='GET' && path==='/api/config') return send(200,{configured});
      if(!configured) return send(503,{error:'.env 파일에 Runpod API 키와 엔드포인트 ID를 설정하고 프로그램을 다시 실행하세요.'});
      if(req.method==='POST' && path==='/api/jobs') {
        if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'JSON 요청만 지원합니다.'});
        let body='';
        for await (const chunk of req) {body+=chunk; if(Buffer.byteLength(body)>16384) return send(413,{error:'입력이 너무 큽니다.'});}
        let input;
        try {input=validate(JSON.parse(body));} catch(error) {return send(400,{error:error.message});}
        const result=await upstream('run',{input,policy:{executionTimeout:900000,ttl:3600000}});
        jobs.add(result.id);
        return send(200,result);
      }
      const match=path.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)(\/cancel)?$/);
      if(match && jobs.has(match[1])) {
        if(req.method==='GET' && !match[2]) return send(200,await upstream(`status/${match[1]}`));
        if(req.method==='POST' && match[2]) return send(200,await upstream(`cancel/${match[1]}`,{}));
      }
      send(404,{error:'작업을 찾을 수 없습니다. 프로그램 재시작 전 작업은 Runpod 콘솔에서 확인하세요.'});
    } catch(error) {send(502,{error:error.name==='TimeoutError' ? '요청 시간이 초과되었습니다. 제출 중이었다면 재시도 전에 Runpod 콘솔에서 중복 작업을 확인하세요.' : error.message});}
  });
}
if(process.argv[1] === fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 8787);
  createApp({key:process.env.RUNPOD_API_KEY,endpoint:process.env.RUNPOD_ENDPOINT_ID}).listen(port,'127.0.0.1',()=>console.log(`Wan Cloud Studio: http://127.0.0.1:${port}`));
}
