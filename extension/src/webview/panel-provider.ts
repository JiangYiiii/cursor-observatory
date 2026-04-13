/**
 * Embeds browser dashboard (localhost) in a WebviewPanel via iframe.
 * primary_doc: docs/EXTENSION_DESIGN.md §七
 */
import * as vscode from "vscode";

export function openObservatoryDashboardPanel(
  port: number,
  workspaceRoot: string
): void {
  const panel = vscode.window.createWebviewPanel(
    "observatoryDashboard",
    "Observatory",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );
  const rootQ = encodeURIComponent(workspaceRoot);
  const url = `http://127.0.0.1:${port}/?root=${rootQ}`;
  const cspPort = String(port);
  panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:${cspPort} http://localhost:${cspPort}; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
</head>
<body style="margin:0;padding:0;height:100vh;background:var(--vscode-editor-background);">
  <iframe id="app" src="${url}" style="width:100%;height:100%;border:none" title="Observatory Dashboard"></iframe>
  <textarea id="_cb" style="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0"></textarea>
  <script>
  (function(){
    var f=document.getElementById('app');
    var cb=document.getElementById('_cb');
    if(!f||!cb)return;
    function send(type,data){f.contentWindow&&f.contentWindow.postMessage(data,'*');}
    function fwd(cmd){send('cmd',{type:'obs-cmd',cmd:cmd});}
    function fwdPaste(t){if(t)send('paste',{type:'obs-paste',text:t});}
    window.addEventListener('message',function(e){
      if(!e.data||e.data.type!=='obs-request-paste')return;
      if(e.source!==f.contentWindow)return;
      try{navigator.clipboard.readText().then(fwdPaste).catch(function(){});}catch(ex){}
    },false);

    /* Intercept execCommand — VS Code calls this on the outer document for clipboard ops */
    var orig=document.execCommand.bind(document);
    document.execCommand=function(cmd){
      if(cmd==='paste'){
        cb.value='';cb.focus();cb.select();
        var r=orig.apply(document,arguments);
        var t=cb.value;
        if(t){fwdPaste(t);return r;}
        /* fallback: try Clipboard API */
        try{navigator.clipboard.readText().then(fwdPaste).catch(function(){});}catch(e){}
        return r;
      }
      if(cmd==='copy'||cmd==='cut'){fwd(cmd);return orig.apply(document,arguments);}
      if(cmd==='selectAll'){fwd('selectAll');return orig.apply(document,arguments);}
      return orig.apply(document,arguments);
    };

    /* Catch native paste event (may carry clipboardData) */
    document.addEventListener('paste',function(e){
      var t=e.clipboardData&&e.clipboardData.getData('text/plain');
      if(t)fwdPaste(t);
    },true);

    /* Catch keyboard shortcuts that reach the outer document */
    document.addEventListener('keydown',function(e){
      var m=e.metaKey||e.ctrlKey;if(!m)return;
      var k=e.key.toLowerCase();
      if(k==='v'){
        cb.value='';cb.focus();cb.select();
        orig.call(document,'paste');
        var t=cb.value;
        if(t){fwdPaste(t);e.preventDefault();return;}
        try{navigator.clipboard.readText().then(function(t2){
          if(t2)fwdPaste(t2);
        }).catch(function(){});}catch(ex){}
      }else if(k==='c'){fwd('copy');}
      else if(k==='x'){fwd('cut');}
      else if(k==='a'){fwd('selectAll');e.preventDefault();}
    },true);
  })();
  </script>
</body>
</html>`;
}
