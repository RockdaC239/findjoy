import { encodeSseMessage } from "./sse";

// 断流只停止发送；已准入任务继续完成保存，并由调用方 finally 释放容量。
export function storyStream(work:(send:(event:string,payload:unknown)=>void)=>Promise<void>): ReadableStream<Uint8Array> {
  let disconnected=false;
  const encoder=new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send=(event:string,payload:unknown) => {
        if (disconnected) return;
        try { controller.enqueue(encoder.encode(encodeSseMessage(event,payload))); }
        catch { disconnected=true; }
      };
      try { await work(send); }
      catch { send("error",{error:"服务暂时不可用，请稍后恢复进度"}); }
      finally { try { controller.close(); } catch { /* 已取消的连接无需再次关闭。 */ } }
    },
    cancel() { disconnected=true; },
  });
}
