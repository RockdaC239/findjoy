import { afterEach,expect,it } from "vitest";
import { mkdtemp,rm,writeFile,readFile,mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run=promisify(execFile);const folders:string[]=[];
afterEach(async()=>{await Promise.all(folders.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
async function temporary(){const dir=await mkdtemp(path.join(tmpdir(),"findjoy-nginx-"));folders.push(dir);return dir;}
it("renders the shared FindJoy and FindFire routes as a valid nginx configuration",async()=>{
 const dir=await temporary();
 const rendered=await run("bash",["deploy/render-nginx.sh","3001","findfire.club","18080","18443",`${dir}/missing.crt`,`${dir}/missing.key`,"www.findfire.club"]);
 const root=rendered.stdout.match(/location \/ \{([^}]+)\}/)?.[1];
 expect(root).toContain("proxy_pass http://127.0.0.1:3003");
 expect(rendered.stdout).toContain("location ^~ /api/v1/");expect(rendered.stdout).toContain("proxy_pass http://127.0.0.1:8003");
 expect(rendered.stdout).toContain("proxy_pass http://127.0.0.1:3001");
 const config=path.join(dir,"nginx.conf");
 await writeFile(config,`pid ${dir}/nginx.pid; error_log stderr; events {} http { access_log off; ${rendered.stdout} }`);
 await run(process.env.NGINX_BIN??"nginx",["-t","-e","stderr","-p",dir+"/","-c",config]);
});
it.each(["test","reload","success"])("applies or restores the config for a %s outcome",async(failure)=>{
 const dir=await temporary();const bin=path.join(dir,"bin");await mkdir(bin);
 await writeFile(path.join(bin,"sudo"),'#!/bin/sh\nexec "$@"\n',{mode:0o755});
 await writeFile(path.join(bin,"nginx"),'#!/bin/sh\n[ "$FAILURE" != test ]\n',{mode:0o755});
 await writeFile(path.join(bin,"systemctl"),'#!/bin/sh\nif [ "$FAILURE" = reload ] && [ ! -f "$MARKER" ]; then touch "$MARKER"; exit 1; fi\nexit 0\n',{mode:0o755});
 const active=path.join(dir,"active.conf"),candidate=path.join(dir,"candidate.conf");
 await writeFile(active,"previous");await writeFile(candidate,"candidate");
 const execution=run("bash",["deploy/apply-nginx.sh",candidate,active],{env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,FAILURE:failure,MARKER:path.join(dir,"failed-once")}});
 if(failure === "success")await execution;else await expect(execution).rejects.toThrow();
 expect(await readFile(active,"utf8")).toBe(failure === "success" ? "candidate" : "previous");
});

it("renders valid HTTPS with shared routes and certificate-covered alias redirects",async()=>{
 const dir=await temporary(),cert=path.join(dir,"cert.pem"),key=path.join(dir,"key.pem"),opensslConfig=path.join(dir,"openssl.cnf");
 await writeFile(opensslConfig,"[req]\ndistinguished_name=dn\n[dn]\n[v3]\nsubjectAltName=DNS:findfire.club,DNS:www.findfire.club\n");
 await run("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=findfire.club","-config",opensslConfig,"-extensions","v3","-keyout",key,"-out",cert]);
 const {stdout}=await run("bash",["deploy/render-nginx.sh","3001","findfire.club","18080","18443",cert,key,"www.findfire.club"]);
 const uncovered=await run("bash",["deploy/render-nginx.sh","3001","findfire.club","18080","18443",cert,key,"www.findfire.cl"]);
 expect(uncovered.stdout).not.toContain("server_name www.findfire.cl;");
 expect(stdout).toContain("server_name www.findfire.club;");expect(stdout).toContain("proxy_pass http://127.0.0.1:3003");expect(stdout).toContain("proxy_pass http://127.0.0.1:8003");
 const config=path.join(dir,"nginx.conf");await writeFile(config,`pid ${dir}/nginx.pid; error_log stderr; events {} http { access_log off; ${stdout} }`);
 await run(process.env.NGINX_BIN??"nginx",["-t","-e","stderr","-p",dir+"/","-c",config]);
});
